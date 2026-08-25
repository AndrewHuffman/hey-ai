# hey-ai Architecture

This document describes the current `v0.6.1` implementation. Red dashed nodes
identify confirmed defects or non-operational paths; dotted edges show failed,
indirect, or intended relationships. See the
[codebase audit](./codebase-audit.md) for evidence and the
[backlog](../TODO.md) for planned remediation.

## System and component topology

`src/index.ts` is both the CLI definition and the query orchestrator. A
`RagEngine` facade owns context providers, persistence, and MCP connectivity;
`LlmWrapper` adapts model providers and AI SDK tools.

```mermaid
flowchart LR
    User["Developer<br/>shell, TTY, or stdin"]
    Clipboard["System clipboard"]

    subgraph Process["hey-ai process"]
        CLI["Commander CLI and query orchestration<br/>src/index.ts"]
        RAG["RagEngine<br/>src/rag/engine.ts"]
        Tools["Internal tool registry<br/>src/tools/internal.ts"]
        LLM["LlmWrapper and AI SDK<br/>src/llm/wrapper.ts"]
        MCP["McpManager<br/>src/mcp/client.ts"]
    end

    subgraph Context["Local context providers"]
        Commands["CommandDetector<br/>installed alternatives"]
        Files["FileContext<br/>project files"]
        History["ZshHistory<br/>terminal history"]
        Docs["Command docs<br/>cache, man, tldr"]
    end

    Config[("config.json")]
    Session[("session.db<br/>history, FTS5, sqlite-vss")]
    DocsCache[("docs cache")]
    Stdio["stdio MCP child processes"]
    Remote["Intended HTTP / SSE endpoints<br/>URL stored; never contacted"]
    SpawnFail["Local sentinel spawn failure<br/>ENOENT"]
    Providers["Anthropic / OpenAI / Google APIs"]
    Embeddings["OpenAI embeddings API<br/>optional"]

    User --> CLI
    CLI --> RAG
    CLI --> LLM
    CLI --> Clipboard
    CLI --> Config
    RAG --> Tools
    RAG --> Commands
    RAG --> Files
    RAG --> History
    RAG --> Docs
    RAG --> MCP
    RAG --> Session
    Docs --> DocsCache
    MCP --> Config
    MCP --> Stdio
    MCP -. "attempts to spawn sentinel locally" .-> SpawnFail
    LLM --> Providers
    Session --> Embeddings

    classDef broken stroke:#d1242f,stroke-width:2px,stroke-dasharray:6 4;
    class Remote,SpawnFail broken;
```

The CLI has no dependency-injection boundary in its production entrypoint.
Constructing `RagEngine` immediately constructs `SessionHistory`, loads the
sqlite-vss extension, creates the session schema, detects commands, and creates
an `McpManager`. This eager work also occurs for lightweight root options such
as `--show-prefs`.

## CLI modes and command routing

Commander exposes four subcommands plus the root query action. Subcommands
manage or display state without entering the root query lifecycle. The root
action supports a positional query, piped input, and an interactive prompt.

```mermaid
flowchart LR
    Start["hey-ai argv"] --> Parse["Commander parses options and command"]
    Parse --> Kind{"Subcommand or root action?"}

    Kind -->|models| Models["Print hard-coded model recommendations"]
    Kind -->|completion| Completion["Print zsh completion script"]
    Kind -->|config| Config["Read or update config.json"]
    Kind -->|mcp| McpCommands["Manage stored MCP server definitions"]
    Kind -->|root action| Root["Enter query-mode routing"]
```

The root action then selects its input mode and initializes MCP before the first
query that needs it:

```mermaid
flowchart TB
    Construct["Construct CommandDetector,<br/>RagEngine, and LlmWrapper"]
    Construct --> Prefs{"--show-prefs?"}
    Prefs -->|yes| ShowPrefs["Print preferences and return<br/>session DB was already opened"]
    Prefs -->|no| ShowContext{"--show-context?"}
    ShowContext -->|yes| PrintContext["Initialize MCP and print context"]
    PrintContext --> Continue["Continue to query handling<br/>despite help text"]
    ShowContext -->|no| Input
    Continue --> Input{"Positional query present?"}

    Input -->|yes| OneShot["One-shot query"]
    Input -->|no and stdin is piped| Pipe["Read all stdin as query"]
    Input -->|no and stdin is TTY| Interactive["Interactive REPL"]
    Pipe --> Empty{"Input empty?"}
    Empty -->|no| OneShot
    Empty -->|yes| End["Return without query"]
    Interactive --> EnsureInteractive["If needed: RagEngine.init<br/>McpManager.connectAll"]
    EnsureInteractive --> Loop["Prompt until exit or quit"]
    Loop --> Query["Process each query with shared RAG/MCP instances"]
    Query --> Loop
    OneShot --> EnsureOneShot["If needed: RagEngine.init<br/>McpManager.connectAll"]
    EnsureOneShot --> Process["Process query once"]
    Process --> DisconnectExit["Disconnect MCP and force clean exit"]
    Loop -->|exit / quit| DisconnectReturn["Disconnect MCP and return"]

    classDef unexpected stroke:#d1242f,stroke-width:2px,stroke-dasharray:6 4;
    class PrintContext,Continue unexpected;
```

`--no-history` and `--no-files` are parsed but never read. `--no-context`
skips the minimal preloaded context string, but MCP still initializes and all
internal and MCP tools are still available to the model.

## Query and tool-call lifecycle

Generation uses AI SDK `generateText`, not streaming. `streamPrompt()` is a
compatibility alias around the same non-streaming method. The public `system`
option is passed to the SDK as `instructions`, and `stopWhen: isStepCount(10)`
bounds the model/tool loop. OpenAI models use the provider's explicit Chat
Completions factory rather than its default Responses API factory.

```mermaid
sequenceDiagram
    actor User
    participant CLI as processQuery / root action
    participant Config as ConfigManager
    participant RAG as RagEngine
    participant MCP as McpManager
    participant LLM as LlmWrapper
    participant SDK as AI SDK generateText
    participant Chat as Selected chat provider

    Note over CLI,MCP: Root action initializes RAG and MCP before the first query
    CLI->>RAG: init()
    RAG->>MCP: connectAll()
    MCP->>Config: loadConfig() for MCP servers
    Config-->>MCP: Server definitions
    User->>CLI: Query and options
    alt context enabled
        CLI->>RAG: assembleContext(query)
        RAG->>MCP: getTools() and getResources(query)
        MCP-->>RAG: Tool and resource metadata
        RAG-->>CLI: Minimal context string
    else --no-context
        CLI->>CLI: Use an empty context string
    end
    CLI->>Config: loadConfig() for defaultModel
    Config-->>CLI: Model configuration
    CLI->>RAG: getInternalTools()
    RAG-->>CLI: Internal schemas first
    CLI->>MCP: getToolDefinitionsForGemini()
    MCP-->>CLI: MCP schemas appended after internal schemas
    CLI->>LLM: streamPrompt(prompt, system, tools)
    Note over LLM,SDK: Non-streaming compatibility alias
    LLM->>LLM: Resolve alias, model, and provider
    LLM->>SDK: generateText(instructions, stopWhen = isStepCount(10))
    SDK->>Chat: Generate response
    loop Zero or more tool steps
        Chat-->>SDK: Tool name and arguments
        SDK->>CLI: onToolCall(name, args)
        alt Internal tool name
            CLI->>RAG: executeInternalTool(name, args)
            RAG-->>CLI: Text result or error
        else MCP tool name
            CLI->>MCP: callTool(name, args)
            MCP-->>CLI: Text-only result or error
        end
        CLI-->>SDK: Tool result text
        SDK->>Chat: Continue generation
    end
    Chat-->>SDK: Final text
    SDK-->>LLM: Complete result
    LLM-->>User: Print complete response to console
    LLM-->>CLI: Return response text
```

Post-response persistence and cleanup happen after the user has already seen
the full answer:

```mermaid
sequenceDiagram
    actor User
    participant CLI as processQuery / root action
    participant RAG as RagEngine
    participant Store as SessionHistory
    participant Embed as OpenAI embeddings API
    participant Clip as Clipboard
    participant MCP as McpManager

    CLI->>RAG: saveInteraction(query, response)
    RAG->>Store: addEntry(query, response, cwd)
    opt OPENAI_API_KEY is available
        Store->>Embed: Request text-embedding-3-small vector
        Embed-->>Store: 1536-dimension vector or error
    end
    Store-->>RAG: History ID
    RAG-->>CLI: Persistence complete
    opt First shell code block exists
        CLI->>Clip: Copy code block
        CLI-->>User: Copy confirmation
    end
    alt One-shot mode
        CLI->>MCP: disconnectAll()
        CLI->>CLI: process.exit(0)
    else Interactive mode
        CLI->>CLI: Keep RAG/MCP instances for next turn
    end
```

The completed response is printed before persistence finishes, but clipboard
completion and one-shot shutdown wait for `saveInteraction()`, including the
optional embedding request.

## Context and tool routing

Only small, generally useful context is assembled before generation. Expensive
or potentially irrelevant context is exposed as tools for the model to request.

```mermaid
flowchart TB
    Query["User query"] --> Assemble["RagEngine.assembleContext"]

    subgraph Preloaded["Preloaded when context is enabled"]
        OS["OS, architecture, shell,<br/>home, and username"]
        Prefs["Detected command preferences"]
        CWD["Current working directory"]
        Names["Internal and MCP tool names"]
        Resources["MCP resource metadata<br/>listed but not readable"]
    end

    OS --> Assemble
    Prefs --> Assemble
    CWD --> Assemble
    Names --> Assemble
    Resources --> Assemble

    Assemble --> Generate["AI SDK generation"]
    Generate --> Decision{"Requested tool name is internal?"}

    Decision -->|search_session_history| Session["SessionHistory.searchHybrid"]
    Decision -->|get_recent_commands| Zsh["ZshHistory.getLastEntries"]
    Decision -->|list_project_files| List["FileContext.listFiles"]
    Decision -->|read_file_content| Read["FileContext.getFileContent"]
    Decision -->|get_command_docs| Man["docs cache -> man -> tldr"]
    Decision -->|no| Mcp["McpManager.callTool"]

    Session --> Result["Text returned to model"]
    Zsh --> Result
    List --> Result
    Read --> Result
    Man --> Result
    Mcp --> Result
    Result --> Generate
```

Tool routing is based on an unqualified global name. An MCP tool that collides
with an internal tool can replace the schema exposed to the AI SDK while still
being executed as the internal tool. Duplicate names across MCP servers are
silently mapped to the last connected server.

## Session persistence and hybrid retrieval

`SessionHistory` uses one SQLite database with a regular history table, an
external-content FTS5 table synchronized by triggers, a sqlite-vss virtual
table, and a mapping table. Embeddings are optional; keyword search remains
available without an OpenAI key.

```mermaid
flowchart TB
    Response["Prompt, response, cwd"] --> Insert["INSERT history"]
    Insert --> Trigger["FTS triggers"]
    Trigger --> FTS[("history_fts")]
    Insert --> Key{"OPENAI_API_KEY?"}
    Key -->|no| Done["History and FTS only"]
    Key -->|yes| Embed["OpenAI text-embedding-3-small"]
    Embed -->|success| VSS[("history_vss")]
    VSS --> Map[("history_embeddings")]
    Embed -->|failure| Warn["Warn; retain keyword-searchable row"]

    Search["searchHybrid(query, limit)"] --> Keyword["Evaluate searchFTS synchronously<br/>BM25"]
    Keyword -->|then start| Semantic["Start async searchSemantic<br/>vector distance"]
    FTS --> Keyword
    VSS --> Semantic
    Map --> Semantic
    Keyword --> Fusion["Normalize, merge, deduplicate,<br/>boost overlap, sort"]
    Semantic --> Fusion
    Fusion --> Results["Top results returned to model"]

    classDef broken stroke:#d1242f,stroke-width:2px,stroke-dasharray:6 4;
    class Fusion broken;
```

Although the results are collected with `Promise.all()`, JavaScript evaluates
the synchronous `searchFTS()` call before `searchSemantic()` is started.

The current BM25 normalization reverses keyword relevance and compresses the
displayed scores near 100%. Existing rows are also not rebuilt into FTS if the
FTS table is introduced after those rows already exist.

```mermaid
erDiagram
    HISTORY ||--o| HISTORY_FTS : "mirrored when indexed"
    HISTORY ||--o| HISTORY_EMBEDDINGS : "optionally indexed"
    HISTORY_VSS ||--o| HISTORY_EMBEDDINGS : "mapped by rowid"

    HISTORY {
        INTEGER id PK
        TEXT prompt
        TEXT response
        INTEGER timestamp
        TEXT cwd
    }
    HISTORY_FTS {
        INTEGER rowid
        TEXT prompt
        TEXT response
    }
    HISTORY_VSS {
        INTEGER rowid
        VECTOR embedding
    }
    HISTORY_EMBEDDINGS {
        INTEGER history_id PK
        INTEGER vss_rowid
    }
```

The stores and inputs used by the context system are:

| Data | Default location | Behavior |
| --- | --- | --- |
| Application configuration | `~/.config/hey-ai/config.json` | Model and MCP server definitions |
| Session history | `~/.config/hey-ai/session.db` | Global across projects; `cwd` is stored but not used to scope search |
| Command docs cache | `~/.cache/hey-ai/docs` | File cache with a 100 MB LRU-style size limit |
| Shell history | `$HISTFILE` or `~/.zsh_history` | Extended zsh-history lines only |
| Project files | Current working directory | Globby scan to depth three; reads are requested on demand |

## MCP configuration and runtime

The CLI accepts stdio, HTTP, and SSE declarations. Configuration normalizes
remote transports into sentinel commands, but `McpManager.connectAll()` always
constructs `StdioClientTransport`. The sentinel is therefore passed to
`spawn()` as if it were an executable.

```mermaid
flowchart TB
    Manage["hey-ai mcp add / add-json / add-preset"] --> Type{"Configured transport"}
    Type -->|stdio| StdioConfig["command, args, env"]
    Type -->|http| HttpConfig["command: __http__<br/>args: URL"]
    Type -->|sse| SseConfig["command: __sse__<br/>args: URL"]
    StdioConfig --> JSON[("config.json")]
    HttpConfig --> JSON
    SseConfig --> JSON

    JSON --> Load["ConfigManager.loadConfig"]
    Load --> Connect["McpManager.connectAll"]
    Connect --> Always["Always create StdioClientTransport"]
    Always -->|real command| Child["Spawn stdio server"]
    Always -. "spawn __http__ or __sse__" .-> Fail["Local ENOENT spawn failure"]
    Http["Intended HTTP endpoint<br/>never contacted"]
    Sse["Intended SSE endpoint<br/>never contacted"]

    Child --> Discover["listTools and map tool name to server"]
    Discover --> Generate["Expose sanitized schemas to AI SDK"]
    Generate --> Call["client.callTool"]
    Call --> Text["Keep text content only"]
    Text --> Model["Return text to model"]

    classDef broken stroke:#d1242f,stroke-width:2px,stroke-dasharray:6 4;
    class HttpConfig,SseConfig,Fail,Http,Sse broken;
```

MCP resources are enumerated into the prompt as metadata, but the CLI exposes
no resource-read operation. Tool results discard structured content, resource
blocks, images, and audio. JSON Schema support is also partial: references and
definitions are removed, while the JSON Schema-to-Zod converter handles only a
small subset of schema forms.

## Build, package, and release flow

The repository supports Node.js 22.13+ within Node 22. `pnpm run build` first
removes the explicit `dist/` directory through a cross-platform Node script,
then compiles TypeScript into a fresh output tree. `package.json.files` permits
only `dist/`; npm also includes `package.json` and README automatically.

`prepack` performs the same clean build. `pnpm run test:package` deliberately
adds stale output before packing, verifies every source runtime module and the
internal tool modules in the inventory, rejects files outside the release
allowlist, installs the tarball into a temporary prefix with an isolated npm
cache/configuration, and runs the installed `--help`, `--version`, and `models`
commands. An optional output path retains the verified tarball for release. Its
metadata parser accepts both npm 10's array output and npm 12's package-name map.

The PR release preflight and release use the same composite actions to install
Node, pnpm, npm, native libraries, and to perform versioning, changelog
generation, artifact verification, and release preparation. The toolchain is
pinned rather than upgraded implicitly: release uses Node 22.23.2, pnpm
10.11.0, and npm 12.0.2. A separate CI job covers the minimum supported Node
22.13.0 runtime with its compatible bundled npm. A PR performs an
`npm publish --dry-run`; the main-branch workflow switches only that final
preparation flag off before publishing the already-verified tarball.

```mermaid
flowchart TB
    Source["src/**/*.ts"] --> Clean["node scripts/clean.mjs<br/>remove only dist/"]
    Clean --> Build["tsc"]
    Build --> Dist["dist/"]
    Allowlist["package.json.files<br/>dist only"] --> Pack["npm pack"]
    Dist --> Pack

    subgraph Smoke["Package verification"]
        Stale["Create stale dist sentinel"] --> Pack
        Pack --> Inventory["Check runtime inventory and exclusions"]
        Inventory --> InstallTar["Install tarball in temporary prefix"]
        InstallTar --> Commands["Run help, version, and models"]
    end

    Setup["Shared pinned setup action<br/>native libraries<br/>pnpm 10.11.0 / npm 12.0.2"]
    Prepare["Shared prepare-release action<br/>version + changelog + verified tarball"]

    subgraph CI["Required PR Validation"]
        MinInstall["Node 22.13.0 compatibility install"] --> MinBuild["clean build + verbose tests"]
        InstallCI["Node 22.23.2 release-toolchain install"] --> BuildCI["clean build + verbose tests"]
        BuildCI --> AuditCI["production audit"]
        AuditCI --> SmokeCI["shared release preparation"]
        SmokeCI --> DryRun["npm publish --dry-run"]
        MinBuild --> GateCI["required PR Validation aggregate"]
        DryRun --> GateCI["required PR Validation aggregate"]
    end

    subgraph Release["Release workflow on main"]
        InstallRelease["frozen install"] --> BuildRelease["clean build"]
        BuildRelease --> TestRelease["verbose tests"]
        TestRelease --> AuditRelease["production audit"]
        AuditRelease --> VerifyRelease["shared release preparation"]
        VerifyRelease --> Publish["npm publish exact tarball"]
        Publish --> Commit["commit, tag, and force-with-lease push"]
    end

    Setup --> InstallCI
    Setup --> InstallRelease
    Prepare --> SmokeCI
    Prepare --> VerifyRelease
    SmokeCI -. "runs" .-> Stale
    VerifyRelease -. "runs and retains" .-> Stale
```

These gates resolve the audit's artifact-completeness and production-advisory
blockers. The release workflow still commits and force-pushes version/changelog
changes after publication, and its generated release text still contains an
obsolete prerequisite; those risks remain in the [prioritized backlog](../TODO.md).

## Current architectural constraints

- Query orchestration, command registration, the system prompt, and MCP presets
  are combined in a single large entrypoint.
- Root-query construction eagerly opens local state before knowing which mode
  needs it, and command detection is duplicated for `--show-prefs`.
- MCP uses the SDK's fixed 60-second request default with no CLI-configurable
  timeout, cancellation surface, or aggregate multi-server startup deadline;
  tool discovery is repeated during connection, context assembly, and query
  preparation.
- Session history and semantic indexing are global, not project-scoped. If an
  OpenAI key is present, saved conversations are embedded through OpenAI even
  when a different provider handled the chat request.
- File access uses lexical path containment. Symlinks can escape the working
  directory, and line-based truncation does not bound a huge single-line or
  binary file before it is read.
- Forced `process.exit()` is used to guarantee one-shot shutdown; SQLite has no
  explicit close lifecycle.
- Provider aliases and descriptions are hard-coded and drift independently
  from provider availability.
