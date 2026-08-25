# Codebase Audit — August 25, 2026

## Purpose and scope

This report records a read-only audit of `hey-ai` at `v0.6.1` on the `main`
branch. It covers source architecture, documentation, tests, build and release
configuration, dependency health, package contents, and isolated CLI behavior.
No runtime code, dependency, workflow, or user-facing README changes were made
as part of the documentation pass that produced this report.

Findings describe observed behavior at the audit date. Priority indicates the
recommended order of remediation, not a claim that every dependency advisory
is exploitable by this CLI.

## Verification baseline

| Item | Observed result |
| --- | --- |
| Repository version | `hey-ai@0.6.1`, tag `v0.6.1` |
| Platform | macOS / Darwin 25.5.0, arm64 |
| Node.js | `v22.15.0` |
| pnpm | `10.11.0` |
| npm | `11.12.1` |
| TypeScript build | `pnpm run build` passed |
| Automated tests | 6 suites and 37 tests passed |
| Coverage probe | 44.46% statements and 29.18% branches, with major modules omitted from collection |
| Production dependency audit | 60 advisories: 16 high, 37 moderate, 7 low |
| Package dry run | Required `dist/tools/**` files absent; unrelated local artifacts permitted |
| Worktree before documentation edits | Clean and aligned with `origin/main` |

The dependency and advisory counts are a registry snapshot from August 25,
2026 and will change over time. The durable backlog asks for remediation and a
fresh audit rather than preserving those counts as acceptance criteria.

## Methodology

The audit included:

- Reading every repository Markdown file, project configuration, source file,
  test, CI workflow, release workflow, and package manifest.
- Reviewing the project tree, recent Git history, ignored files, generated
  output, and imports that have no source callers.
- Running the TypeScript build and the complete Jest suite serially in verbose
  mode.
- Exercising help, version, model listing, completions, configuration, MCP
  presets, MCP inspection, context display, command preferences, and failure
  handling with isolated home/configuration directories.
- Probing FTS and hybrid ranking with temporary session databases, including an
  in-memory ranking probe.
- Initializing a legacy history database to test FTS migration behavior.
- Adding temporary HTTP/SSE MCP configuration to observe runtime transport
  selection without touching the user's real configuration.
- Inspecting dependency engine constraints, outdated packages, production
  advisories, dependency paths, and the npm tarball inventory.
- Extracting and starting a packed artifact to verify runtime completeness.

## Executive summary

The core idea remains coherent: assemble a small amount of environment context,
offer heavier context through internal tools, merge those tools with MCP tools,
run a bounded AI SDK tool loop, save the interaction, and copy the first shell
code block. The TypeScript build and existing test suite are green.

The most urgent issue is outside those tests: the npm package created from the
current tree omits the required internal-tools runtime directory and fails on
startup. The production dependency audit also reports a large set of known
advisories, including direct MCP SDK and AI SDK dependency paths. Beyond those
release blockers, the audit confirmed several user-visible contract failures,
search correctness bugs, configuration recovery problems, and security/privacy
gaps.

## Post-audit remediation — August 25, 2026

The verification baseline and findings above remain the historical record of
the audited `v0.6.1` tree. The following changes were made afterward:

- Commit `1dc1f81` replaced `.npmignore` with a `dist` allowlist, made every
  build clean `dist/`, and added a tarball test that verifies all compiled
  runtime modules, rejects stale and maintainer-only files, installs the
  artifact in an isolated prefix, and runs the installed help, version, and
  model-listing commands. CI and release use that test, and release publishes
  the exact verified tarball.
- Commit `7e9acd9` upgraded to AI SDK 7, provider packages 4.x, MCP SDK 1.30,
  globby 16.2, and refreshed compatible production dependencies. It migrated
  the tool-loop API while keeping OpenAI on Chat Completions and added direct
  LLM wrapper, embedding, and mocked MCP transport regression suites.
- Post-remediation verification passed 9 suites and 46 tests, produced a
  complete 15-file runtime tarball, and reported no known production
  vulnerabilities. The supported runtime is now Node.js 22.13+ within Node 22,
  tested at the minimum runtime and the pinned release runtime in CI.
- Release run
  [32900023653](https://github.com/AndrewHuffman/hey-ai/actions/runs/32900023653/job/97971412783)
  exposed a remaining CI/release mismatch: release installed `npm@latest`
  (npm 12.0.2) while PR CI used npm 10.9.x. npm 12 changed `npm pack --json`
  from an array to a package-name map, so the artifact verifier—not the valid
  tarball—failed only after merge. The follow-up pins the shared toolchain,
  accepts and tests both metadata formats, and makes PR CI run the same shared
  version/changelog/package preparation plus `npm publish --dry-run`.

## P0 — Release blockers

The release policy used by this audit treats a high-severity advisory in the
shipped production graph as P0 until it is patched or a documented reachability
assessment explicitly accepts the residual risk.

| Finding | Evidence | Impact | Recommended outcome |
| --- | --- | --- | --- |
| Packed CLI omits required runtime modules | The historical `.npmignore` (removed during remediation) contained `tools/`, which also excluded `dist/tools/**`. `npm pack --dry-run` contained no `dist/tools/index.js` or `dist/tools/internal.js`; starting an extracted artifact raised `ERR_MODULE_NOT_FOUND` from `dist/rag/engine.js`. | A newly published package cannot start. | Replace the broad ignore rules with a `package.json` `files` allowlist, clean before build, and add an extract-and-run package smoke test before publishing. |
| Production dependency tree has known advisories | `pnpm audit --prod` reported 60 advisories, including 16 high. Direct paths include `@modelcontextprotocol/sdk`; transitive paths include Hono, Express-related packages, `picomatch`, and AI SDK provider utilities. | Known vulnerabilities remain in the shipped dependency graph, although applicability varies by used code path. | Block publication until patched versions are adopted or each remaining high-severity path has a documented reachability and risk decision. Review breaking AI SDK changes separately. |

### Package hygiene details

The tarball inspection also showed why a package allowlist is preferable:

- Local coverage reports are eligible for inclusion when present because
  `.npmignore` does not exclude `coverage/`.
- A globally ignored local `.claude/settings.local.json` was eligible for the
  local tarball even though it was not tracked by Git.
- `dist/mcp/config.js` is a stale compiled file for a source module deleted in
  2025; `tsc` does not clean `dist/` before compiling.
- Maintainer documents and agent workflow files are shipped despite not being
  required by the CLI runtime.

A clean release checkout will not contain every local artifact observed in the
audit, but the package rules currently permit them. The required
`dist/tools/**` omission occurs in both clean and dirty builds.

## P1 — Correctness and operational reliability

| Area | Confirmed finding | Evidence and behavior |
| --- | --- | --- |
| MCP transports | HTTP and SSE can be configured but cannot connect. | [`src/index.ts`](../src/index.ts) stores remote definitions as `__http__` or `__sse__`; [`McpManager.connectAll()`](../src/mcp/client.ts) always creates `StdioClientTransport`. Isolated remote-transport probes attempted to spawn the sentinel command and failed with `ENOENT`. |
| Context display | `--show-context` does not stop after displaying context. | Help promises “without calling LLM,” but the root action continues into `processQuery`. With no API key, the command printed context, then `Thinking...`, a raw SDK stack trace, and exit code 1. |
| Context flags | `--no-history` and `--no-files` do nothing; `--no-context` is incomplete. | The first two options are defined but never read. `--no-context` still initializes all MCP servers and gives the model session/file internal tools. |
| Version reporting | Runtime version is detached from package metadata. | `hey-ai --version` printed `1.0.0` while `package.json` and the Git tag report `0.6.1`. The MCP client also advertises `1.0.0`. |
| Hybrid search | Keyword relevance is reversed and displayed relevance is compressed. | BM25 returns more-negative scores for stronger matches. `1 - abs(score) / max`, combined with a floor of `1`, gives stronger matches a lower fused score and makes tiny BM25 values display near 100%. A two-row probe ranked the weaker match first. |
| FTS migration | Existing rows are not backfilled when the FTS table is introduced. | Initialization creates the external-content table and triggers but never runs the FTS `rebuild` command. A legacy database returned its row through recent history but not through `searchFTS`. |
| Configuration migration | The old `mcp.json` fallback is unreachable for its intended case. | [`ConfigManager.loadConfig()`](../src/config.ts) returns immediately when `config.json` is missing, before attempting the legacy path. |
| Configuration errors | Malformed or schema-invalid configuration is silently replaced in memory with an empty MCP configuration. | Broad catch handling suppresses parse and validation errors. A later update can overwrite user state without first surfacing or preserving the invalid file. Writes are not atomic. |
| Provider setup | “Any provider key” is not enough on a fresh installation. | Model precedence eventually falls back to `gpt-4o-mini`; a user with only an Anthropic or Gemini key must also select/configure the matching model. Missing keys produce raw SDK errors instead of actionable setup guidance. |
| Initialization | Lightweight modes create persistent state and load native extensions. | The root action constructs `RagEngine` before checking `--show-prefs`. An isolated preferences-only run created `~/.config/hey-ai/session.db`. Empty piped input has the same eager setup. |
| Post-response processing | Persistence failure can turn a rendered answer into command failure and prevent clipboard copying. | `processQuery()` awaits `saveInteraction()` before extracting/copying the code block. Optional indexing errors are handled, but a primary database failure propagates after the answer has already printed. |
| Cleanup | Database and main-module lifecycles are brittle. | `SessionHistory` exposes no close operation, one-shot mode relies on forced `process.exit()`, the entrypoint calls `program.parse()` despite async actions, and broad filename suffix checks determine whether the module is main. |
| Runtime support | The documented Node.js floor is too low and no package engine is declared. | README says Node 18+. Installed Inquirer supports specific floors within Node 20/21/22/23+, while `better-sqlite3` supports selected majors. The practical shared LTS ranges are Node 20.12+ on 20.x and Node 22.13+ on 22.x; CI and release validate only one of those each. |
| Release safety | Publication is not gated on the test suite or a package smoke test. | The release workflow builds and publishes but does not run tests. It can race the separate CI workflow, updates Git after publishing, and generated notes still claim the unrelated Datasette `llm` CLI is required. |

## P2 — Security, privacy, robustness, and maintainability

| Area | Finding | Risk or cost |
| --- | --- | --- |
| Secret handling | `hey-ai mcp get <name>` prints configured environment-variable values verbatim. | Terminal logs, recordings, or copied output can expose credentials. |
| MCP authority | Tool calls execute without a human confirmation boundary. | A configured MCP server can expose mutating filesystem or external-service tools directly to the model. |
| Tool namespaces | Internal and MCP tools share unqualified names; duplicate MCP names overwrite routing state. | The schema shown to the model can differ from the executor selected by the CLI. |
| MCP schemas | Schema sanitization removes references/definitions and the JSON Schema-to-Zod converter ignores unions, nullable values, constraints, and other forms. | Valid MCP tools can receive incorrect validation or become unusable. |
| MCP content | Tool results retain only text blocks, and resources are listed but cannot be read. | Structured content, embedded resources, images, and audio are silently discarded; “universal” MCP support is overstated. |
| Timeouts and discovery | The CLI supplies no timeout policy and tools are listed during connection, context assembly, and query preparation. | The MCP SDK applies a fixed 60-second request default, but it is not user-configurable or cancellable and sequential multi-server startup has no aggregate deadline. Repeated discovery adds latency and failure surface. |
| Cross-provider privacy | When `OPENAI_API_KEY` exists, every saved conversation is sent to OpenAI for embedding even if Anthropic or Google generated the response. | Data crosses provider boundaries without an explicit semantic-search opt-in or notice. |
| History scope | Session search is global across projects. `cwd` is stored but not used for filtering or shown in results. | Unrelated project context can leak into a later answer. |
| File confinement | Containment is lexical and follows in-tree symlinks outside the working directory. | `read_file_content` can escape its documented directory boundary through a symlink. |
| File limits | The complete file is read before line truncation; one huge line or binary file bypasses the intended output bound. | Memory/token use can spike and binary data can be injected into the prompt. |
| Prompt/tool output | File and history content is inserted into model-visible text without a trust boundary. | Stored or local content can contain prompt-injection instructions or fence-breaking Markdown. |
| Entry-point size | CLI definitions, query orchestration, the system prompt, model presentation, and MCP presets live in `src/index.ts`. | Behavior is difficult to isolate and test; unrelated changes share one large module. |
| Dead code/dependencies | Several private helpers and exported APIs have no source callers; direct dependencies `@google/generative-ai`, `execa`, and `ignore` are unused. | Maintenance and upgrade surface is larger than necessary. |
| Test isolation | Some tests use fixed paths under the OS temp directory; `SessionHistory` creates the default config directory even with an explicit DB path. | Concurrent test processes can collide and tests can create unexpected state. |

## Usability observations

- Help and administrative subcommands are quick and readable when they avoid
  the root action.
- The model list is easy to scan, but aliases and descriptions are static and
  already lag current provider generations.
- The generated zsh completion covers the main command groups and root flags.
- Tool-call feedback distinguishes internal context tools from MCP tools, but
  verbose mode does not display arguments or results, making failures hard to
  diagnose.
- Missing API keys and provider errors print implementation-heavy stack traces
  in normal mode.
- Clipboard copying waits until history persistence and optional semantic
  indexing finish even though the full answer has already been printed.
- Interactive mode appropriately reuses MCP connections and context providers,
  but it has no per-turn cancellation, history management, or explicit session
  boundary.

## Documentation drift

The user-facing README was intentionally left unchanged in this pass. Follow-up
work should correct these discrepancies:

- Context is no longer preloaded as “the last 15 commands,” mentioned-file
  contents, and recent session history. Those sources are exposed through
  on-demand internal tools.
- Responses do not stream; `streamPrompt()` delegates to `generateText()`.
- `gemini` resolves to `gemini-2.0-flash`, not the documented 1.5 model.
- Node 18 is not supported by several current direct dependencies.
- HTTP/SSE MCP examples create configuration that the runtime cannot use.
- `--no-history`, `--no-files`, and `--show-context` do not behave as described.
- Release notes incorrectly list the Datasette `llm` CLI as a prerequisite.
- The demo and setup flow predate the on-demand context architecture.

## Testing and observability gaps

All existing tests passed, but their green status does not exercise the most
important failing paths:

- CLI tests mock the RAG and LLM layers and assert selected console strings.
  The `--show-context` test therefore passes while encoding the unexpected
  continuation behavior.
- There are no direct suites for `ConfigManager`, `McpManager`, `LlmWrapper`,
  `RagEngine`, `CommandDocsCache`, schema conversion, remote transports, package
  contents, or release behavior.
- Search tests do not assert hybrid ordering, score meaning, legacy FTS
  backfill, vector/mapping transactionality, or cross-project filtering.
- CLI coverage omits provider selection errors, real tool routing, stdin and
  interactive cleanup, option semantics, versioning, and most config/MCP
  subcommands.
- Coverage configuration does not collect from all source modules, so the
  reported percentage overstates whole-source coverage.
- CI's lint step is an informational placeholder; there is no lint or format
  script and no coverage threshold.
- CI validates Node 20 on Linux while release uses Node 22; macOS/native-module
  compatibility and the supported Node matrix are not exercised.

## Recommended remediation order

1. Make the packed artifact complete and add a pre-publish install/start smoke
   test.
2. Upgrade or otherwise remediate audited production dependencies, then record
   the remaining advisory rationale.
3. Repair search ranking/backfill and the CLI's documented option contracts.
4. Implement real remote transports or remove their configuration surface until
   supported.
5. Harden configuration recovery, provider setup, lifecycle cleanup, and
   release gating.
6. Add security/privacy boundaries and expand tests around every corrected
   behavior.
7. Modularize the entrypoint and remove dead code after behavior is protected by
   tests.

The actionable form of this ordering lives in [TODO.md](../TODO.md).
