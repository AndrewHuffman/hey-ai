# Todo

> [!IMPORTANT] Agent Instructions
> **Completing Tasks:** Mark the item as `[x]`, move it to the **Completed** section, and append the relevant commit hash(es).
> **Suggestions:** If you have any suggestions, please append them to the relevant section, marked with [🤖 Suggestion].

## Refinements

### Setup & Ease of Use

- [ ] Make it easier to setup. For instance, we should detect if they have appropriate environment variables set, and if not, we should prompt them to set them.
- [ ] Maybe a walkthrough the first time they run it?
- [ ] Other ideas?

### Context Retrieval & Usage Improvements

- [ ] Arguably, the agent should use a tool call (can be internal) to ask for the context, and then use that context to provide a more accurate response. I think we have to balance, what is likely needed for most tasks against what can be retrieved when needed.

### Best Practices

- [ ] We should externalize all prompts into a template files
- [ ] Human in the Loop interrupts; maybe use LangGraph for simple orchestrations?
- [ ] Evaluation testing using LangSmith & LLM-as-a-Judge

---

# Completed

## Bugs

- [x] `✓ Command copied to clipboard!` is a lie
- [x] **CI/CD:** Add changelog & release notes

## Refinements

- [x] **Context Retrieval & Usage Improvements:** (Commit: 456b736)
  - [x] Use context selectively only when applicable (heuristic triggers).
  - [x] Implement RAG and semantic search (FTS5 + sqlite-vss) to narrow down context.
  - [x] Avoid irrelevant context carry-over from previous turns.
- [x] **System Prompt Improvements:**
  - [x] Its role is to provide the developer with CLI commands and functions.
  - [x] It is not to complete the task for the developer. It is to provide the developer with the tools to complete the task.
  - [x] It can use MCP tools to help provide more accurate and complete responses.
  - [x] When asking for a command, it should simply provide a single command, ideally as a parameterized function with echos instead of comments since pasting comments in the terminal causes errors.
- [x] **OS Specificity:**
  - [x] Always include the OS information in the context/prompt.
  - [x] Instruct the agent to use appropriate commands/arguments for that specific platform (e.g. macOS vs Linux).

## Quality

None

## Features

None
