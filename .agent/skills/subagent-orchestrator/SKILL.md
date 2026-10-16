---
name: subagent-orchestrator
description: Standardized operational protocol for Master Agent to orchestrate and delegate all technical tasks (coding, debugging, testing, refactoring) to specialized subagents. The Master Agent acts purely as an Executive Assistant & Orchestrator.
---

# 🤖 Subagent Orchestration & Task Delegation Protocol

This skill guides the **Master Agent** in orchestrating and delegating tasks to specialized subagents within the `checkin-app` monorepo and production environments.

> [!IMPORTANT]
> **Core Principle**: The Master Agent is the user's **Executive Assistant & Orchestrator**.
> - Master Agent **plans, clarifies, delegates, audits, and communicates**.
> - Specialized Subagents **execute, code, debug, and test**.
> - The Master Agent **NEVER** performs multiline code edits or long test loops directly in the main conversation.

---

## 1. When to Use This Skill

- Whenever any coding, bug fixing, refactoring, or performance optimization task is initiated.
- Whenever running test suites, browser Playwright tests, or benchmarks.
- Whenever conducting deep VPS log investigations or Docker troubleshooting.
- Whenever a task spans multiple tiers (e.g., Backend API + Admin SPA / Staff PWA).

---

## 2. The 4-Phase Orchestration Workflow

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Clarify & Formulate Plan (Master Agent)       │
│ • Understand requirements & risk level (Thấp/TB/Cao)   │
│ • Verify Non-Dev Maintainer invariants                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: Dispatch Specialized Subagent(s)              │
│ • Subagent name: [YYYY-MM-DD HH:mm | #id] <Role>       │
│ • Clear briefing: Scoped files + Task + Test gate      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: Subagent Execution & Durable Handover         │
│ • Write changes directly to DISK                       │
│ • Run native tests (pnpm test / npm run test:e2e)      │
│ • Return structured payload (Files, Tests, Evidence)   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: Audit, Synthesize & Report (Master Agent)     │
│ • Inspect git diff & test outputs                      │
│ • Present clear Vietnamese summary to maintainer       │
└────────────────────────────────────────────────────────┘
```

---

## 3. Phase Details & Guidelines

### Phase 1: Task Formulation (Master Agent)
Before launching any subagent:
1. **Analyze Scope & Invariants**:
   - Check if the task touches database schema (Zero destructive resets rule).
   - Check if the task touches authentication/RBAC or public API contracts.
2. **Break into Atomic Sub-tasks**:
   - If fullstack: Split into Backend API (`apps/api`) and Frontend Client (`apps/admin-spa` or `apps/staff-pwa`).
   - If single-component: Define the exact files and behavior required.

### Phase 2: Subagent Dispatch, Model Tiering & Naming
When invoking subagents via `invoke_subagent`:

1. **Mandatory Model & Effort Tiering**:
   - **Master Agent**: Runs on **Argon 4 High** (`pro` High).
   - **Standard Subagents (`Model: "flash"` — Flash 3.8 High Default)**: Explicitly pass `"Model": "flash"` for normal coding, UI components, API routes, unit/E2E test execution, CI/CD deployment monitoring (`gh run watch`), and research. Do **NOT** default every subagent to `"inherit"` (Argon 4).
   - **Complex Architecture Subagents (`Model: "pro"` — Argon 4 High)**: Use `"Model": "pro"` only for complex core packages (`packages/*`), distributed systems/concurrency algorithms, or deep multi-service debugging.

2. **Mandatory Naming Standard**:
   ```text
   [YYYY-MM-DD HH:mm | #<issue>] <Descriptive Role>
   ```
   *Examples:*
   - `[2026-10-07 11:45 | #attendance] Staff Checkin Mutation Specialist`
   - `[2026-10-07 11:45 | #e2e] Shift Calendar Playwright Tester`
   - `[2026-10-07 11:45] Valkey Cache Concurrency Benchmarker`

3. **Subagent Briefing Template**:
   Always pass a structured, self-contained prompt to the subagent:
   ```text
   ROLE: [Descriptive Role]
   TASK OBJECTIVE: <What needs to be implemented or fixed>
   TARGET DIRECTORY: <Path, e.g. apps/api or apps/admin-spa>
   SPECIFIC REQUIREMENTS:
   - <Invariant 1, e.g. Zero destructive DB changes>
   - <Invariant 2, e.g. Type-safe DTOs using @checkin/shared>
   VERIFICATION GATE:
   - Run native test: <e.g. pnpm --filter @checkin/api test>
   RETURN PAYLOAD:
   - Return modified files list
   - Return test execution command & passing output
   - Return any residual risks or observations
   ```

### Phase 3: Subagent Execution & Handover (Executor)
The subagent:
1. Edits files on disk using `write_to_file` or `replace_file_content`.
2. Runs native repository test commands directly.
3. Does NOT ask the user questions directly; communicates results back to Master Agent.
4. Returns a structured markdown summary upon completion.

### Phase 4: Audit & Synthesis (Master Agent)
Upon receiving the subagent's return payload:
1. **Audit Disk Changes**: Check `git status` or diff to ensure only scoped files were modified.
2. **Verify Evidence**: Ensure all tests actually passed without mocks masking failures.
3. **Report to Maintainer**:
   - Format in clear, supportive Vietnamese.
   - Categorize by Risk Level: **Thấp** (Low), **Trung bình** (Medium), **Cao** (High).
   - State what changed and what was verified.
   - Present next actions (e.g. ready to commit or deploy).

---

## 4. Anti-Patterns & Prohibitions

| ❌ Anti-Pattern | ✅ Correct Practice |
| :--- | :--- |
| Master Agent writes 100+ lines of application code directly in main chat. | Dispatch a specialized subagent to write and test the code. |
| Master Agent runs iterative debugging loops and retries tests 5 times. | Delegate root-cause investigation and test iteration to a Debugging Subagent. |
| Subagent named `helper`, `worker`, or `researcher`. | Use standardized timestamped name: `[YYYY-MM-DD HH:mm] <Descriptive Role>`. |
| Master Agent dumps 200 lines of raw terminal logs to user. | Master Agent digests subagent findings and provides a concise executive summary. |
| Subagent skips running tests before reporting done. | Subagent must execute native test suite and provide evidence. |
