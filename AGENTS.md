# AGENTS.md

This file provides guidance to AI coding agents working in this repository.
Read [the architecture guide](docs/architecture.md), [the dated codebase
audit](docs/codebase-audit.md), and [the backlog](TODO.md) before changing
cross-cutting behavior.

## Project Overview

`hey-ai` is a TypeScript CLI for terminal-oriented LLM interactions. It adds
small amounts of local environment context to each query and exposes heavier
context through internal AI tools. It supports Anthropic, OpenAI, and Google
models through Vercel AI SDK 7 and can call tools from configured MCP servers.

The current design is on-demand rather than eager context injection:

- Always-preloaded context, unless `--no-context` is supplied: OS details,
  detected command preferences, current working directory, available tool
  names, and MCP resource metadata.
- On-demand context: session history, zsh history, project file listings, file
  contents, and command documentation.

The current runtime supports stdio MCP connections only. The CLI can store HTTP
and SSE definitions, but `McpManager` attempts to launch their sentinel values
as stdio executables. Treat remote transport support as a known defect, not a
working feature.

## Prerequisites

- Node.js 22.13+ within Node 22.x. AI SDK 7 intentionally drops Node 20. CI
  validates Node 22.13.0 plus the pinned Node 22.23.2 release runtime.
- pnpm 10. CI and release currently pin pnpm 10.11.0.
- A provider key matching the selected chat model:
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`/`GOOGLE_API_KEY`.
- `OPENAI_API_KEY` specifically enables semantic session-history indexing.
  Full-text history search continues to work without it.
- Native build/runtime support for `better-sqlite3` and `sqlite-vss`. Linux CI
  installs SQLite, BLAS, LAPACK, and OpenMP system libraries.
- zsh history is the only shell-history format currently parsed.

## Development Commands

### Build and run

```bash
# Build TypeScript to dist/
pnpm run build

# Run the TypeScript entrypoint with tsx
pnpm run dev -- "how do I find large files?"

# Run the compiled CLI
pnpm run start -- "how do I find large files?"

# Build and link globally for manual testing
pnpm run build:link
```

The build removes `dist/` with `scripts/clean.mjs` before invoking `tsc`, so
deleted source modules cannot survive as stale compiled output. `prepack` runs
the same clean build.

### Test

```bash
# Run the complete test suite serially with detailed names
pnpm test --runInBand --verbose

# Run a specific suite
NODE_OPTIONS=--experimental-vm-modules pnpm exec jest tests/session.test.ts --runInBand --verbose

# Run in watch mode
pnpm test --watch --verbose

# Audit shipped dependencies for high-severity advisories
pnpm run audit:prod

# Pack, inspect, install, and execute the release artifact
pnpm run test:package
```

When exercising the full CLI, isolate its home/configuration paths so tests do
not read or modify the maintainer's real `~/.config/hey-ai`, docs cache, session
database, or shell history. Prefer constructor-injected temporary paths for
unit tests. Use unique temporary directories rather than fixed names so
parallel runs cannot collide.

## Architecture

See [docs/architecture.md](docs/architecture.md) for current-state Mermaid
diagrams covering system topology, CLI modes, query/tool lifecycles, context
routing, session persistence, MCP, and release flow.

### CLI and query orchestration (`src/index.ts`)

- `createProgram()` defines the root query action and the `models`,
  `completion`, `config`, and `mcp` command groups.
- The root action accepts one positional query, reads piped stdin when no query
  is provided, or starts an Inquirer REPL on a TTY.
- `processQuery()` assembles minimal context, resolves configuration, merges
  internal and MCP tools, invokes the LLM, saves history, and copies the first
  shell code block.
- Interactive mode reuses one `RagEngine`, `LlmWrapper`, and set of MCP
  connections across turns. One-shot mode disconnects MCP and then forces a
  clean process exit.
- Root option handling is eager: constructing `RagEngine` opens/initializes the
  session database before `--show-prefs` can return.
- The entrypoint currently uses `program.parse()` even though actions are async.

### RAG facade (`src/rag/engine.ts`)

`RagEngine` owns:

- `ZshHistory`
- `FileContext`
- `SessionHistory`
- `CommandDetector`
- `CommandDocsCache`
- `McpManager`

`assembleContext(query)` preloads only lightweight context. It also asks MCP
servers for resource metadata, but the CLI has no operation for reading those
resources. Heavy local context is exposed through the internal tool registry.

`getManPage(command)` uses this lookup order:

1. Docs cache.
2. `man`, stripped through `col -b` and reduced to introductory sections.
3. `tldr`, with automatic updates disabled.

### Internal context tools (`src/tools/internal.ts`)

There are five tools:

- `search_session_history` → `SessionHistory.searchHybrid()`
- `get_recent_commands` → `ZshHistory.getLastEntries()`
- `list_project_files` → `FileContext.listFiles()`
- `read_file_content` → `FileContext.getFileContent()`
- `get_command_docs` → `RagEngine.getManPage()`

The LLM decides whether to call these tools. Old heuristic helpers in
`RagEngine` are not part of the current request path.

Internal tool names and MCP tool names share one global namespace. The CLI
checks internal names first at execution time; this can misroute a colliding MCP
tool even if its schema overwrote the internal definition exposed to the AI SDK.

### LLM wrapper (`src/llm/wrapper.ts`)

- Resolves friendly aliases and infers a provider from the resolved model name.
- Model precedence is: CLI `--model` → configuration `defaultModel` →
  `LLM_MODEL` → `gpt-4o-mini`.
- Adapts JSON Schema tool definitions to a limited Zod subset.
- Calls AI SDK `generateText()` with `instructions` and
  `stopWhen: isStepCount(10)`.
- Uses the explicit OpenAI Chat Completions factory so the AI SDK 7 migration
  does not change OpenAI provider behavior to the default Responses API.
- `streamPrompt()` is a backward-compatible alias around non-streaming
  generation. Responses are not streamed today.
- Prints the complete response before returning it to the query orchestrator.

Provider/model validation happens during the SDK request. A fresh installation
with only an Anthropic or Gemini key must also select a matching model because
the final default is OpenAI.

### MCP manager (`src/mcp/client.ts`)

- Loads server definitions through `ConfigManager`.
- Currently constructs only `StdioClientTransport`.
- Calls `listTools()` while connecting and stores an unqualified
  tool-name-to-server mapping.
- Aggregates tools/resources from connected servers.
- Sanitizes tool JSON Schema by deleting unsupported keys, including `$ref`
  and definitions, rather than resolving them.
- Routes tool calls by name and keeps text content blocks only. Structured
  content, resources, images, and audio are discarded.
- Passes no CLI-specific timeout and relies on the MCP SDK's fixed 60-second
  request default. There is no user-configurable timeout, cancellation surface,
  or aggregate startup deadline across servers.
- Suppresses most discovery failures and treats tool failures as non-fatal
  model-visible errors.

### Configuration (`src/config.ts`)

Configuration is stored at `~/.config/hey-ai/config.json` and contains:

- Optional `defaultModel`.
- A map of MCP server definitions shaped as `command`, optional `args`, and
  optional `env`.

Remote MCP entries are encoded as special command strings rather than a typed
transport union. The legacy `mcp.json` fallback does not currently run when
`config.json` is missing because the ENOENT branch returns first. Other load or
schema errors are silently treated as empty configuration.

### Context and persistence

| Component | Default location or input | Current behavior |
| --- | --- | --- |
| App configuration | `~/.config/hey-ai/config.json` | Default model and MCP server definitions |
| Session history | `~/.config/hey-ai/session.db` | SQLite history, FTS5, and sqlite-vss; global across projects |
| Command docs cache | `~/.cache/hey-ai/docs` | File cache with 100 MB LRU-style eviction |
| Shell history | `$HISTFILE` or `~/.zsh_history` | Extended zsh-history entries |
| Project files | Current working directory | Gitignore-aware listing to depth three; reads on demand |

`SessionHistory` writes the prompt/response first, allowing FTS search even if
embedding fails. When an OpenAI key is present it then sends the combined text
to `text-embedding-3-small` and stores the vector in sqlite-vss. This happens
regardless of which provider handled the chat model.

Hybrid search evaluates synchronous FTS first, starts the asynchronous vector
search, and merges both result sets after semantic search completes. The current
BM25 normalization reverses keyword relevance, and initialization does not
rebuild FTS for rows that predate the virtual table. Do not treat hybrid
relevance percentages as reliable until those TODO items are fixed.

## Testing Patterns and Gaps

- Jest runs in ESM mode through `ts-jest` and maps source `.js` import suffixes
  back to TypeScript during tests.
- File and history tests use real temporary files; session tests use temporary
  SQLite databases and mock embeddings.
- CLI tests mock the RAG, LLM, command detection, and clipboard boundaries and
  assert selected console output.
- Internal-tool tests mostly use mocked providers and validate registration,
  routing, formatting, and argument bounds.
- Direct suites cover `LlmWrapper`, embeddings, and `McpManager` connection,
  discovery, routing, calls, and cleanup with mocked transports. There are no
  direct suites for `ConfigManager`, `RagEngine`, `CommandDocsCache`, or real
  MCP transport behavior.
- `test:package` checks the tarball inventory, installs the artifact in an
  isolated temporary prefix, and executes its administrative commands.
- Coverage does not collect from all source modules and has no threshold.
- CI builds and tests on the minimum Node 22.13 runtime. A separate release
  preflight uses the exact production toolchain: Node 22.23.2, pnpm 10.11.0,
  and npm 12.0.2 through the same setup action as release. Its lint step is only
  a placeholder.
- Husky's pre-commit hook runs the TypeScript build only.

Always add a regression test for a fixed defect. For CLI behavior, assert the
absence of forbidden side effects and calls, not only the presence of a console
header.

## Package and Release Safety

Production packaging is allowlisted and verified:

- `package.json.files` includes only `dist/`; npm adds package metadata and the
  README automatically.
- Every build and `prepack` removes `dist/` before compiling.
- `test:package` proves stale output is cleaned, checks every runtime module and
  rejects source, tests, docs, coverage, settings, and maintainer workflows.
- The smoke test installs the tarball into a clean temporary prefix and runs
  the installed help, version, and models commands.
- The package metadata parser supports npm 10's array response and npm 12's
  package-name map, including lifecycle output before the JSON document.
- CI and release share pinned setup and release-preparation composite actions.
  PR validation performs the version bump, changelog generation, retained
  package verification, and `npm publish --dry-run` that precede a real release.
- CI and release block on verbose tests, the high-severity production audit,
  and package verification. Release publishes the retained verified tarball,
  not a repack of the working directory.

Do not publish the working directory directly. Generate and publish the exact
verified tarball. Never use `npm@latest` in release automation: update the
pinned npm version in the shared setup action and verify the resulting PR CI
before merging. The release workflow's post-publication force-push and stale
generated release-note prerequisite remain known risks.

## Important Conventions

- The project is ESM (`"type": "module"`). Source imports of local modules use
  `.js` extensions under NodeNext resolution.
- TypeScript strict mode is enabled; `isolatedModules` supports the Jest ESM
  setup.
- Prefer failures that preserve keyword history/search when optional embedding
  or vector operations fail.
- Disconnect MCP clients on every exit path. New code should prefer explicit
  disposal over adding more forced exits.
- Never print stored MCP environment values. The current `mcp get` behavior is
  a known security defect.
- Preserve the system prompt's terminal-assistant role and clipboard contract
  unless a task explicitly redesigns product behavior.
- `CLAUDE.md`, `GEMINI.md`, and `GPT.md` are symlinks to this file and update
  automatically with it.
- Keep repository documentation consistent with this file; project-local
  memory takes precedence over global memory.

## Current Known Limitations

The authoritative, prioritized list is [TODO.md](TODO.md); supporting evidence
is in [docs/codebase-audit.md](docs/codebase-audit.md). High-impact limitations
include:

- Configured-but-unusable HTTP/SSE MCP transports.
- Ineffective context flags and a `--show-context` mode that still calls an LLM.
- Hard-coded runtime version drift.
- Incorrect hybrid keyword ranking and missing legacy FTS backfill.
- Eager state creation, incomplete cleanup, and limited test coverage.
- MCP secret disclosure, tool-name collisions, partial schema/content support,
  and no human approval boundary for mutating tools.
- Cross-provider semantic indexing and global cross-project history search.
- Stale README setup, context, model, streaming, and MCP claims.

## Git Workflow

- Main branch: `main`.
- Conventional commits are enforced by commitlint.
- Husky runs the build before commits.
- Changelog and npm release automation run from `.github/workflows/release.yml`.
- The release workflow currently force-pushes its generated version/changelog
  commit with `--force-with-lease`; treat release changes as high risk.
