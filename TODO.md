# Todo: Bugs, Refinements, Quality, & Features

## Agent Instructions

| Action               | Instruction                                                                                            |
| :------------------- | :----------------------------------------------------------------------------------------------------- |
| **Completing Tasks** | Mark the item as `[x]`, move it to the **Completed** section, and append the relevant commit hash(es). |

## Bugs

- [ ] ...

## Refinements

- [ ] **Context Retrival & Usage Improvements:**
  - [ ] It should use context when applicable, but it shouldn't assume something in the context is always relevant.
  - [ ] For instance, if I ask it to help me write an `fd` command, and then I follow up later asking it to help me convert an gif to video, it shouldn't take into account the `fd` context.
  - [ ] Arguably, the agent should use a tool call (can be internal) to ask for the context, and then use that context to provide a more accurate response. I think we have to balance, what is likely needed for most tasks against what can be retrieved when needed.
  - [ ] For instance, if I ask it to use fd to find something, it doesn't really need to know other commands or even history unless my query appears to be a follow up to a previous command.
  - [ ] Relatedly, we should use RAG and semantic search to narrow down the context to the most relevant content. This would allow us to have available, for instance, all possible commands/path binaries available on the system (ideally with descriptions of what they do), but only retrieve those that are most relevant to the query.
- [ ] **Best Practices:**
  - [ ] We should externalize all prompts into a template files
  - [ ] Human in the Loop interrupts; maybe use LangGraph for simple orchestrations?

## Quality

- [ ] Evaluation testing using LangSmith & LLM-as-a-Judge

## Features

- [ ] ...

---

# Completed

## Bugs

- [x] `✓ Command copied to clipboard!` is a lie

## Refinements

- [x] **System Prompt Improvements:**
  - [x] Its role is to provide the developer with CLI commands and functions.
  - [x] It is not to complete the task for the developer. It is to provide the developer with the tools to complete the task.
  - [x] It can use MCP tools to help provide more accurate and complete responses.
  - [x] When asking for a command, it should simply provide a single command, ideally as a parameterized function with echos instead of comments since pasting comments in the terminal causes errors.
- [ ] **OS Specificity:**
  - [ ] Always include the OS information in the context/prompt.
  - [ ] Instruct the agent to use appropriate commands/arguments for that specific platform (e.g. macOS vs Linux).

## Quality

None

## Features

None
