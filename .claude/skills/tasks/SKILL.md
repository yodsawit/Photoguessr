---
name: tasks
description: Track multi-step work in TASKS.md when built-in task tools (TaskCreate/TodoWrite) are unavailable. Use at the start of any 3+ step task and whenever a step starts or finishes.
allowed-tools: Read Edit Write
---

# Task tracking via TASKS.md

`TASKS.md` at the project root has three sections: `## Now`, `## Next`, `## Done`.

1. Before starting a multi-step task, add each step as `- [ ] <step>` under `## Next`.
2. When you start a step, move it to `## Now` (only one item there at a time).
3. When it finishes, change to `- [x] <step> (YYYY-MM-DD)` and move it to the top of `## Done`.
4. Update the file at the moment state changes — never retroactively at the end.
5. If a step is blocked, leave it in `## Now` with ` — BLOCKED: <reason>`.
