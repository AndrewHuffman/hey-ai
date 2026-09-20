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

### Eval Framework

Evaluate whether the shipped combination of model, system prompt, context, tool
definitions, and orchestration helps users solve terminal tasks. Command
correctness is part of product quality even when a failure originates in the
model. Keep deterministic regression tests alongside behavioral evals.

Current behavior: session and zsh history are fetched on demand through
`search_session_history` and `get_recent_commands`; neither is automatically
included in the initial context. The system prompt requests a single code
block, no surrounding prose, and parameterized functions for complex logic.
The CLI copies the first supported shell code block to the clipboard.

The proposals below are agreed backlog work, not completed implementation.
The intended output contract permits useful prose and requires functions only
for complex/reusable solutions; see [Response Presentation and Clipboard](#response-presentation-and-clipboard).

#### Tool Selection and Context Use

- [ ] **Cover all five built-in tools with positive and negative selection cases:** For each tool, include cases where it is required, where it is allowed, and where it is unnecessary/forbidden given the supplied context. Judge the information needed, not trigger words alone.

| Built-in tool | Expected selection | Expected non-selection |
| --- | --- | --- |
| `get_recent_commands` | “Why did my last terminal command fail?” with the command available only in the history fixture. | The relevant command and error are already supplied, or the question concerns a previous hey-ai conversation. |
| `search_session_history` | “Adapt the backup command we discussed earlier” with the prior solution available only in session history. | The prior solution is already supplied, or the question concerns only a recent terminal command. |
| `list_project_files` | “Which configuration files does this project have?” with no file listing supplied. | A self-contained syntax question, or a known file path that can be read directly without discovery. |
| `read_file_content` | “Explain the scripts in this project's package.json” with its contents available only through the file fixture. | The full relevant content is already supplied, or only filenames/structure are requested. |
| `get_command_docs` | “Check the locally installed command's docs for the supported option” with the answer available only in the docs fixture. | A basic syntax question with sufficient context, or the relevant documentation is already supplied. |

- [ ] **Exercise combined retrieval:** Include discovering a file and then reading it, and retrieving history followed by command-doc verification when both are needed. Check that unrelated tools remain unused and already-sufficient results do not trigger redundant calls.
- [ ] **Check arguments and use of results:** Validate targeted search terms, file paths, and bounded retrieval; verify the final answer uses relevant returned facts rather than merely rewarding a tool call. Permit equivalent valid tool paths unless order is essential.
- [ ] **Cover negative and failure cases:** Include self-contained questions, ambiguous references, empty history, irrelevant results, unavailable tools, and tool errors. Reward clarification or an honest limitation when the needed context is missing, rather than invented history.
- [ ] **Measure retrieval quality separately:** Use labeled session fixtures to measure whether relevant entries appear near the top, independently of whether the model chooses the search tool. Track the existing hybrid-ranking/backfill defects as known failures, not acceptable baselines.

#### Response Quality and Task Success

- [ ] **Evaluate concise, focused answers:** Assess whether the response addresses the requested task without unnecessary alternatives or explanation. Keep completeness and correctness distinct from brevity.
- [ ] **Evaluate the agreed output contract:** Allow direct commands for simple tasks and require functions for complex/reusable solutions. Allow useful prose, including clarification, missing-context explanations, and tool failures, outside runnable code blocks. Evaluate whether code and prose are distinctly separated; verify exact clipboard contents through deterministic extraction/rendering tests rather than judge ratings.
- [ ] **Evaluate primary-solution identification:** Check that the model explicitly identifies the primary runnable solution or returns no primary when clarification, missing values, or ambiguity prevent a usable recommendation. Cover combined required steps, separate alternatives, non-runnable examples, and parameterized function definitions without invocation. Evaluate the semantic correctness of these choices separately from schema validation and clipboard behavior; a `runnable` label does not prove correctness or safety.
- [ ] **Build task datasets with verifiable outcomes:** Include representative command tasks with inputs and expected results, so evals assess whether the output solves the problem rather than matches one reference string.
- [ ] **Evaluate platform specificity and safety:** Cover macOS/BSD versus Linux/GNU commands, the stated shell and installed tools, quoting and filenames with spaces, and unintended destructive effects.
- [ ] **Assess LLM-as-a-judge for snippets:** Explore a more capable judge for qualities that deterministic checks cannot establish; keep core tests independent of LangSmith or any hosted eval service.
- [ ] **Use objective checks first:** Check format and shell syntax, then execute selected snippets against disposable fixtures and assert output, exit status, and filesystem changes. Syntax validity alone does not establish task success. Use an isolated execution environment without host credentials, host mounts, or network access for generated commands; a temporary directory alone is not a security boundary.
- [ ] **Calibrate judge scoring:** Define separate correctness, relevance, concision, and safety rubrics; compare judge ratings with human-reviewed examples. Version the judge prompt/model, provide the task context and tool evidence, and do not let a favorable judge score override an objective failure.

#### Harness and Rollout

- [ ] **Set up eval infrastructure:** Support the tool-use, response, and context-retrieval cases above, with inspectable per-case results.
- [ ] **Separate test layers:** Keep mocked-provider contract tests deterministic; use a real model with controlled tool fixtures to assess model decisions; add a smaller integration set using actual context providers against isolated synthetic data. Stubbed retrieval cannot validate search quality.
- [ ] **Reuse production behavior:** Exercise the production prompt, tool definitions, and routing rather than a copied eval prompt. Add the smallest injection/trace seams needed to control OS, shell, command availability, history, and tool results, and capture calls, arguments, results, final text, usage, and timing. The wrapper currently returns only text, and query orchestration embeds the prompt and reads the host OS.
- [ ] **Version cases and runs:** Record case IDs, fixture/rubric versions, code revision, resolved model and provider settings, prompt version/hash, repeated trials, and per-case failures. Define required, allowed, and forbidden tools plus outcome assertions for each case; retain failures rather than retrying until a pass.
- [ ] **Keep runs isolated and bounded:** Use synthetic history/files and fake MCP tools; isolate home/config/database/cache paths, stub clipboard writes, and disable incidental embedding requests. Make live-model and judge calls explicit, budgeted runs with timeouts and call limits.
- [ ] **Start small before gating CI:** Begin with roughly 15–25 human-reviewed cases covering direct answers, both history sources, file/docs lookup, failure handling, and platform differences. Report dimension-level pass rates, run counts, latency, and token usage; distinguish provider/harness errors from behavioral failures. Repeat live cases to understand variability before selecting regression thresholds or making paid evals release-blocking.

#### Decisions to Discuss

- **Initial scope:** Prioritize internal context tools and command suggestions, or include MCP tool selection in the first dataset? Mutation approval and context-flag enforcement remain separate product fixes; evals should expose their gaps without treating model behavior as enforcement.
- **Run policy:** Which model/configuration is the initial baseline, how often should live runs occur, and what cost/variance is acceptable? Comparative evals remain independent of the already-planned Luna default update.
- **Framework choice:** Choose a runner or hosted integration after agreeing on the case schema, trace requirements, and first dataset.

### Setup and Ease of Use

- [ ] Add a `doctor`-style command that reports provider keys, selected model, native SQLite/sqlite-vss readiness, shell-history availability, clipboard support, and MCP connectivity without calling an LLM.
- [ ] [🤖 Suggestion] Offer opt-in configuration defaults based on detected shell, platform, provider keys, and installed modern CLI alternatives.

### Model Selection

#### OpenAI Model Updates

- [ ] **Make GPT-5.6 Luna the lightweight OpenAI default:** Change the final `gpt-4o-mini` fallback to `gpt-5.6-luna`, preserving the multi-provider design and explicit legacy-model selection. Comparative model evaluations are not a prerequisite for this update.
  - [ ] Preserve and test model precedence: CLI `--model` → configuration `defaultModel` → `LLM_MODEL` → `gpt-5.6-luna`. Do not rewrite existing user configuration.
  - [ ] Keep Luna on OpenAI Chat Completions and set `providerOptions.openai.reasoningEffort: "none"` only when the resolved model is `gpt-5.6-luna`, including selections through aliases. This setting is required for tool calling on that endpoint; leave other models' provider options unchanged.
  - [ ] Add local `gpt`, `luna`, and `gpt-luna` aliases for `gpt-5.6-luna`; preserve existing GPT-4 aliases and direct model-ID selection. OpenAI's Models API exposes model IDs and basic metadata, but no friendly-alias mapping or alias-to-snapshot relationship.
  - [ ] Update `hey-ai models`, README model examples, `AGENTS.md`, and the architecture guide to describe the new default accurately.
  - [ ] Add regression coverage for default resolution, alias routing, model precedence, Luna-specific reasoning configuration, internal/MCP tool loops, and legacy/other-provider compatibility.
  - [ ] Add an integration test using the real AI SDK/OpenAI adapter with mocked HTTP: assert the Chat Completions request contains `model: "gpt-5.6-luna"` and `reasoning_effort: "none"`, then complete a tool-call/result round trip. Mocking `generateText` and provider factories alone does not verify this contract.
  - [ ] Keep Astra out of the recommended model catalog, aliases, and default; test that exclusion without adding a runtime model blocklist.
- [ ] **Investigate API-backed OpenAI model discovery:** Use `GET /v1/models` for available model IDs while keeping friendly CLI aliases and lightweight-model recommendations locally curated. Keep discovery optional and separate from normal query startup, with an offline/no-key fallback; do not infer cost, capabilities, or alias targets from model names or creation dates. See the [Models API reference](https://developers.openai.com/api/reference/typescript/resources/models/methods/list).

#### Claude Model Updates

- [ ] **Refresh lightweight Claude model recommendations:** Scope and target model TBD.

### Features

- [ ] **Streaming responses:** Use streaming generation and preserve tool-call feedback, history persistence, errors, and clipboard extraction.
- [ ] **Image file support:** Accept and analyze image files through multimodal provider capabilities while enforcing file-size and privacy controls.

### Response Presentation and Clipboard

Agreed product direction; implementation is still pending. These requirements
apply to the prompt, terminal rendering, and clipboard extraction, with eval
coverage linked from [Eval Framework](#eval-framework).

- [ ] **Permit useful prose:** Replace the blanket single-code-block/no-prose instruction with a contract that allows concise explanation, clarification, missing-context messages, and tool-failure messages. Keep prose outside runnable code; do not require explanations to be encoded as `echo` commands.
- [ ] **Use functions where justified:** Require parameterized functions for complex/reusable solutions; allow simple commands without a function wrapper.
- [ ] **Introduce an internal structured response contract:** Have the model return ordered, typed blocks with unique IDs and an explicit nullable `primarySolutionId`. Distinguish prose, runnable shell code, sample output, and non-runnable examples (including config fragments, pseudocode, and usage examples). Runnable blocks carry a shell language and code; the primary ID identifies the recommended runnable solution. Keep this structure internal and render normal terminal output. Do not infer primary status from block order, highlighting, shell fence labels, or wording such as “recommended.”
- [ ] **Define primary-solution eligibility in the prompt:** Select a solution that directly addresses the request with the available context. Set `primarySolutionId` to `null` for clarification-only responses, illustrative-only responses, or no clear runnable recommendation. Resolve missing values through clarification or a usable parameterized function rather than unresolved placeholders.
- [ ] **Apply the agreed multiple-block policy:** Automatically copy the single designated primary solution. Combine required steps into one runnable block or an appropriate function. Present alternatives separately and never concatenate them into the copied solution. Skip automatic copying when no clear primary exists.
- [ ] **Allow function definitions without invocation:** A usable parameterized function definition can be the primary solution on its own. Display usage separately as an example excluded from automatic copying; do not append an invocation that would execute the function when pasted. Reconcile the prompt's existing comment/example instructions with this separation.
- [ ] **Validate before copying:** Validate the response schema, unique block IDs, and primary reference. A non-null primary must reference exactly one runnable block with a supported shell language and nonempty code. If validation fails, leave the clipboard unchanged, explain that nothing was copied, and never fall back to the first code block. Treat structural validity as distinct from command correctness and safety.
- [ ] **Clearly distinguish runnable code from prose and examples:** Render by block type with explicit visual boundaries and a clear primary-solution label. Consider syntax highlighting or contrasting styles; the distinction must also remain clear without color and in piped/plain-text output. The exact presentation remains to be designed.
- [ ] **Copy only the validated primary code:** Copy its exact code payload independently of rendering. Exclude prose, Markdown fences, terminal styling/ANSI escapes, tool feedback, alternatives, sample output, config fragments, pseudocode, unresolved-placeholder examples, and separate usage examples. No primary means no clipboard write or copy-success claim; emit success only after a successful clipboard write. A code fence or model-assigned label alone does not establish that content is a usable solution.
- [ ] **Add presentation and clipboard regression coverage:** Assert exact copied content for mixed prose/code, reordered blocks, separate alternatives, combined steps, styled output, and function definitions with separate usage examples. Assert no clipboard writes for null primary, non-runnable-only responses, malformed responses, duplicate IDs, dangling primary references, non-runnable primary targets, unsupported shells, and empty primary code. Verify copy-success messages reflect actual writes. Keep semantic primary-selection evals separate from deterministic schema, renderer, and clipboard guarantees.

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

## Features

None
