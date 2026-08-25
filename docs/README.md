# hey-ai Documentation

The architecture guide describes the current implementation. The audit keeps
its dated `v0.6.1` baseline and records later remediation and release incidents
separately. These documents are a memory aid for maintainers, not a promise
that every depicted path is working as intended.

- [Architecture](./architecture.md) — components, query lifecycles, context
  retrieval, persistence, MCP, and release flows.
- [Codebase audit](./codebase-audit.md) — the August 25, 2026 verification
  baseline, confirmed defects, usability findings, and technical debt.
- [Agent guidance](../AGENTS.md) — development commands, repository
  conventions, and current implementation constraints.
- [Backlog](../TODO.md) — prioritized follow-up work from the audit.
- [Project README](../README.md) — user-facing installation and usage guide.

The architecture diagrams intentionally distinguish current behavior from
configured or intended behavior. In particular, HTTP and SSE MCP servers can
be stored in configuration but cannot currently be connected by the runtime.
