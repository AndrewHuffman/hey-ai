# Todo

> [!IMPORTANT] Agent Instructions
> **Completing Tasks:** Mark the item as `[x]`, move it to the **Completed** section, and append the relevant commit hash(es).
> **Suggestions:** If you have any suggestions, append them to the relevant section and mark them with `[🤖 Suggestion]`.
> **Regression Safety:** A confirmed defect is not complete until its fix has automated coverage appropriate to the failure mode.

Priorities:

- **P0:** Release or security blocker. Address before publishing another version.
- **P1:** Confirmed correctness, compatibility, or operational reliability issue.
- **P2:** Security hardening, maintainability, observability, quality, or planned feature work.

Supporting evidence and reproduction notes are in the [August 2026 codebase audit](docs/codebase-audit.md).

## P0 — Release and Dependency Safety

None.

## P1 — Correctness and Reliability

### MCP Transports

- [ ] **Implement real HTTP and SSE clients or remove their CLI surface:** The CLI currently stores `__http__`/`__sse__` markers that `McpManager` tries to execute as stdio commands.
- [ ] **Replace sentinel commands with typed configuration:** Introduce a discriminated transport schema with explicit stdio, HTTP, and SSE fields plus migration for existing configuration.

### Session Search

- [ ] **Correct hybrid relevance:** Fix BM25 normalization so stronger keyword matches rank higher, define meaningful score fusion, and add ordering/score regression tests.
- [ ] **Backfill legacy FTS rows:** Rebuild the external-content FTS table when needed so sessions created before FTS initialization are searchable.
- [ ] **Make indexing transactional:** Keep vector insertion and `history_embeddings` mapping consistent when either write fails.

### CLI Contracts

- [ ] **Fix context flags:** Make `--no-history`, `--no-files`, and `--no-context` consistently control the documented context sources, tool exposure, and initialization costs—or remove obsolete options.
- [ ] **Fix `--show-context`:** Print assembled context and exit without selecting/calling a model, saving history, or touching the clipboard.
- [ ] **Source versions from package metadata:** Keep `hey-ai --version`, MCP client identity, package version, and release tag consistent.
- [ ] **Use the async entrypoint correctly:** Replace broad filename-based main detection with an exact module check and await Commander through `parseAsync()`.
- [ ] **Improve normal-mode errors:** Replace raw provider/API-key stack traces with actionable messages while preserving full diagnostics behind `--verbose`.

### Configuration and Provider Setup

- [ ] **Repair legacy migration:** Check the old `mcp.json` path when `config.json` is absent and persist a validated migration safely.
- [ ] **Fail safely on invalid configuration:** Surface parse/schema errors, preserve the invalid source for recovery, validate updates, and write atomically.
- [ ] **Make fresh-install provider selection coherent:** Detect available provider keys, select a compatible configured/default model, or fail early with explicit setup guidance.
- [ ] **Add first-run setup assistance:** Detect missing provider environment variables and guide the user through choosing a provider/model.
- [ ] **Add an optional first-run walkthrough:** Explain configuration, privacy implications, MCP authority, session history, and semantic indexing.

### Lifecycle and Release

- [ ] **Initialize lazily:** Avoid constructing SQLite, sqlite-vss, MCP, and duplicate command detection for modes that do not need them.
- [ ] **Make post-response persistence non-fatal:** Do not turn an already-rendered successful answer into exit 1 or prevent clipboard copying when history/database persistence fails; report the secondary failure appropriately.
- [ ] **Add explicit disposal:** Close session databases and MCP clients on every success, empty-input, cancellation, and error path without relying on forced process exits.
- [ ] **Make release Git operations safer:** Avoid force-pushing generated release commits and ensure tags/changelog/version changes cannot diverge after publication.
- [ ] **Remove stale generated release notes:** Delete the obsolete Datasette `llm` CLI prerequisite.

## P2 — Hardening, Quality, and Product Work

### Security and Privacy

- [ ] **Redact MCP environment values:** `mcp get` should show variable names and a redacted/set status, never secret values.
- [ ] **Add human-in-the-loop approval:** Require confirmation or a configurable policy before MCP tools mutate files, external services, or other system state; evaluate lightweight orchestration before adopting LangGraph.
- [ ] **Make semantic indexing explicit:** Document and configure the fact that an OpenAI key sends saved conversations to OpenAI for embeddings even when another provider handles chat.
- [ ] **Define history-persistence controls:** Decide whether `--no-history` affects retrieval only and add a separate persistence opt-out if users need queries/responses not to be stored.
- [ ] **Scope session retrieval:** Support project/cwd filtering and show the source project in history results to prevent unrelated context carry-over.
- [ ] **Harden file boundaries:** Resolve real paths to prevent symlink escape, reject non-files/binary content as appropriate, and enforce byte/token limits before reading the whole file.
- [ ] **Treat retrieved content as untrusted:** Delimit/sanitize file, command-history, session-history, docs, and MCP content to reduce prompt-injection and Markdown-fence risks.

### MCP Robustness

- [ ] **Namespace or reject tool collisions:** Handle internal/MCP and cross-server duplicate names deterministically before exposing definitions to the model.
- [ ] **Preserve valid JSON Schema:** Resolve references and support unions, nullable values, constraints, and other MCP schema forms instead of deleting or narrowing them.
- [ ] **Support complete MCP results:** Preserve structured content, resource blocks, images, audio, and errors instead of returning text blocks only.
- [ ] **Make resources usable:** Add resource reading and targeted resource discovery rather than listing metadata the model cannot access.
- [ ] **Expose MCP timeout and cancellation policy:** Make the SDK's fixed 60-second request default configurable, bound aggregate multi-server startup, support cancellation, and report server-specific timeout failures.
- [ ] **Cache discovery safely:** Avoid listing the same tools repeatedly during connection, context assembly, and query preparation.
- [ ] **Add MCP authority documentation:** Explain server trust, environment handling, filesystem roots, and mutation risk during setup.

### Debugging and Observability

- [ ] Add `--show-tools` or enhance `--verbose` to display sanitized tool arguments, responses, provider/model selection, context decisions, connection status, and timing.
- [ ] Add structured diagnostics that distinguish configuration, native-extension, provider, MCP transport, tool-validation, and persistence failures.

### Testing and CI

- [ ] Add direct tests for `ConfigManager`, `McpManager`, `LlmWrapper`, `RagEngine`, `CommandDocsCache`, embeddings, schema conversion, and cleanup.
- [ ] Add end-to-end CLI tests for versioning, context flags, `--show-context`, stdin, interactive exit, provider errors, config/MCP subcommands, and absence of unwanted state.
- [ ] Add session tests for hybrid ordering, FTS migration/backfill, vector transactionality, project scoping, and embedding failure/timeout behavior.
- [ ] Add packaging and release tests that inspect the tarball allowlist and execute the installed artifact.
- [ ] Collect coverage from all source modules, introduce practical thresholds, and report uncovered files accurately.
- [ ] Replace fixed temporary fixture names with unique `mkdtemp` directories for parallel-safe tests.
- [ ] Prevent `SessionHistory(customDbPath)` from creating the default home configuration directory and add a regression test for constructor isolation.
- [ ] Add lint and format scripts and replace the CI lint placeholder.
- [ ] Test the supported Node matrix and native SQLite/sqlite-vss behavior on Linux and macOS.

### Architecture and Maintainability

- [ ] [🤖 Suggestion] Split `src/index.ts` into command registration, query orchestration, prompts, model presentation, and MCP preset modules.
- [ ] Externalize system prompts into versioned template files with focused tests.
- [ ] [🤖 Suggestion] Remove dead methods/exports and unused direct dependencies after tests protect the relevant compatibility boundaries.
- [ ] [🤖 Suggestion] Separate response rendering from `LlmWrapper` so the wrapper can be tested without console side effects.
- [ ] [🤖 Suggestion] Avoid repeated synchronous `which` subprocesses and duplicate `CommandDetector` construction during startup.
- [ ] Add evaluation testing for command correctness, platform specificity, tool selection, and safety; assess LLM-as-a-judge tooling without coupling core tests to LangSmith.

### Setup and Ease of Use

- [ ] Add a `doctor`-style command that reports provider keys, selected model, native SQLite/sqlite-vss readiness, shell-history availability, clipboard support, and MCP connectivity without calling an LLM.
- [ ] [🤖 Suggestion] Offer opt-in configuration defaults based on detected shell, platform, provider keys, and installed modern CLI alternatives.

### Features

- [ ] **Streaming responses:** Use streaming generation and preserve tool-call feedback, history persistence, errors, and clipboard extraction.
- [ ] **Image file support:** Accept and analyze image files through multimodal provider capabilities while enforcing file-size and privacy controls.

### Documentation

- [ ] Refresh README setup, true on-demand context behavior, model aliases, Node requirements, option semantics, non-streaming behavior, and current MCP transport support.
- [ ] Refresh or replace the stale demo after CLI contracts and streaming behavior are settled.
- [ ] Keep architecture diagrams and the dated audit linked from user-facing maintainer documentation after major changes.

---

# Completed

## Release and Dependency Safety

- [x] **Repair the npm artifact:** Replaced `.npmignore` with a `dist` package allowlist that includes the internal tool modules. (Commit: 1dc1f81)
- [x] **Clean before compiling:** `pnpm run build` now removes `dist/` safely before invoking TypeScript. (Commit: 1dc1f81)
- [x] **Test the exact package:** Added an isolated pack/install smoke test for help, version, and model listing. (Commit: 1dc1f81)
- [x] **Harden package hygiene:** The package test rejects stale output and files outside the runtime allowlist. (Commit: 1dc1f81)
- [x] **Enforce a release advisory policy:** CI and release now block on the production high-severity audit gate. (Commit: 7e9acd9)
- [x] **Remediate production advisories:** Upgraded the AI, MCP, globbing, and affected transitive dependency graph to zero known production advisories at verification time. (Commit: 7e9acd9)
- [x] **Stage breaking upgrades:** Migrated to AI SDK 7/provider 4 APIs with direct regression coverage for model selection, tool schemas, tool execution, stopping, response handling, and embeddings. (Commit: 7e9acd9)
- [x] **Set and test the supported Node range:** Declared Node `^22.13.0`; CI covers Node 22.13 plus the pinned Node 22.23.2 release runtime, and AI SDK 7 intentionally removes Node 20 support. (Commit: 7e9acd9; exact release pin refined in the current change.)
- [x] **Gate release on verification:** Release now runs build, tests, the production audit, clean package creation, and installed-artifact smoke checks, then publishes that exact verified tarball. (Commits: 1dc1f81, 7e9acd9)
- [x] **Eliminate CI/release toolchain drift:** PR CI and release share pinned Node/pnpm/npm setup and the same version, changelog, and verified-tarball preparation; PRs also exercise `npm publish --dry-run`. The package verifier accepts regression-tested npm 10 and npm 12 metadata shapes. (This follow-up change.)

## Bugs

- [x] `✓ Command copied to clipboard!` is a lie
- [x] **CI/CD:** Add changelog & release notes

## Refinements

- [x] **Context Retrieval & Usage Improvements:** (Commit: 456b736)
  - [x] Use context selectively only when applicable. (Historical heuristic approach; superseded by LLM-selected internal tools.)
  - [x] Implement RAG and semantic search (FTS5 + sqlite-vss) to narrow down context.
  - [x] Reduce irrelevant context carry-over from previous turns. (Historical milestone; project-scoped retrieval remains open.)
- [x] **System Prompt Improvements:**
  - [x] Its role is to provide the developer with CLI commands and functions.
  - [x] It is not to complete the task for the developer. It is to provide the developer with the tools to complete the task.
  - [x] It can use MCP tools to help provide more accurate and complete responses.
  - [x] When asking for a command, it should simply provide a single command, ideally as a parameterized function with echos instead of comments since pasting comments in the terminal causes errors.
- [x] **OS Specificity:**
  - [x] Always include the OS information in the context/prompt.
  - [x] Instruct the agent to use appropriate commands/arguments for that specific platform (e.g. macOS vs Linux).
- [x] **On-Demand Context Retrieval via Internal Tools:**
  - [x] Implemented internal context tools that the LLM can call on-demand instead of pre-loading all context.
  - [x] Created `search_session_history`, `get_recent_commands`, `list_project_files`, `read_file_content`, and `get_command_docs`.
  - [x] Simplified `assembleContext()` to include minimal pre-loaded context.
  - [x] Added tool routing to distinguish internal tools from MCP tools.
  - [x] Updated the system prompt with context-tool guidance.
  - [x] Added automated coverage for internal-tool registration and execution.

## Quality

None

## Features

None
