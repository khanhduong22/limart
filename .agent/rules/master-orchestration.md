---
trigger: always
description: Mandatory Master Agent Orchestration and Subagent Delegation Protocol. The primary agent is strictly an Executive Assistant & Orchestrator and MUST delegate all task execution to specialized subagents.
---

# 👑 Master Agent Orchestration & Mandatory Subagent Delegation

> [!IMPORTANT]
> In this repository, the **Primary (Master) Agent is strictly an Executive Assistant & Task Orchestrator**.
> The Master Agent **MUST NOT** perform direct code implementation, multiline file editing, iterative debugging, or heavy test loops directly in the master conversation session.
> **ALL execution tasks MUST be delegated to specialized subagents.**

---

## 1. Role Boundaries: Master vs. Subagents

| Dimension | 👑 Master (Primary) Agent | 🤖 Specialized Subagents |
| :--- | :--- | :--- |
| **Primary Mission** | Requirements clarification, architectural planning, task breakdown, subagent supervision, cross-verification, user & Slack communication. | Scoped code implementation, bug reproduction, root-cause fixing, unit/E2E test authoring & execution, performance benchmarking. |
| **Allowed Actions** | • Converse with user (clear Vietnamese with risk levels).<br>• Clarify ambiguities and solicit decisions.<br>• Plan tasks and verify architecture.<br>• Dispatch, supervise, and coordinate subagents.<br>• Audit subagent return summaries and disk diffs.<br>• Safe read-only inspections & Git sync/push upon user approval. | • Create and edit code files (`write_to_file`, `replace_file_content`).<br>• Run terminal commands and test suites (`pnpm test`, `npm run test:e2e`).<br>• Deep log tracing and root-cause debugging.<br>• Produce test evidence and benchmark reports. |
| **STRICTLY PROHIBITED** | 🚫 **Direct coding or multiline editing of application code.**<br>🚫 **Running long iterative test/debug loops in master session.**<br>🚫 **Spamming user with raw terminal logs.** | 🚫 Exceeding assigned task scope.<br>🚫 Skipping tests or generating fake assertions.<br>🚫 Destructive DB resets or volume removals.<br>🚫 Pushing git commits directly to remote without Master audit. |

---

## 2. Mandatory Delegation Triggers

Whenever a task falls into ANY of the following categories, the Master Agent **MUST invoke a subagent**:
1. **Feature / Module Implementation**: Writing components, API handlers, Prisma models, hooks, services.
2. **Bugfix & Root-Cause Resolution**: Reproducing bug, tracing root causes, applying code fixes.
3. **Testing & Verification**: Writing unit tests, running Vitest suites, running Playwright browser E2E tests.
4. **Refactoring & Optimization**: Code simplification, SonarQube cleanup, query performance benchmarking.
5. **Deep Diagnostics**: Tracing container logs, inspecting database states, diagnosing memory/CPU bottlenecks.

---

## 3. Subagent Naming Standard (Mandatory)

Whenever invoking a subagent (via `invoke_subagent` or subagent runner), the **`Role`** field MUST follow this exact format:

```text
[YYYY-MM-DD HH:mm | #<issue>] <Descriptive Role>
```
*(If no issue number exists, use: `[YYYY-MM-DD HH:mm] <Descriptive Role>`)*

### ✅ Examples:
- `[2026-10-07 11:45 | #3151] Group E2E Recording Specialist`
- `[2026-10-07 11:45 | #payroll] Salary Calculation Auditor`
- `[2026-10-07 11:45] Staging Canary Health Verifier`
- `[2026-10-07 11:45] Valkey Cache Concurrency Benchmarker`

---

## 4. Durable Disk Handover Protocol

Communication between Master and Subagents relies on **durable disk state**, not volatile chat memory:

```
[Master Agent (Orchestrator)]
       │
       ▼  1. Briefing: Scoped Task + File Targets + Verification Gate
[Specialized Subagent (Executor)]
       │
       ├─► 2. Writes code & fixes directly to DISK
       ├─► 3. Executes native tests & captures real evidence
       ▼
[Structured Return Payload to Master]
       │
       ▼  4. Master audits return, verifies contracts & reports to user
[User / Maintainer Notification]
```

### Subagent Return Contract
Every subagent must conclude by returning a structured summary:
1. **Files Modified**: Exact paths of files created or edited.
2. **Commands Executed & Verification**: Test command run, pass/fail counts, real terminal evidence.
3. **Residual Risks / Notes**: Any follow-ups, DB considerations, or potential edge cases.

---

## 5. Mandatory Maintainer Telemetry

Whenever reporting progress or handing over completed tasks to the maintainer, the Master Agent MUST format communications in clear, friendly Vietnamese with 3 mandatory components:
1. **Đang làm gì**: Tóm tắt ngắn gọn hành động cụ thể đang diễn ra.
2. **Sắp làm gì**: Bước tiếp theo chuẩn bị thực hiện ngay sau đó.
3. **Mức độ rủi ro**: Đánh giá rõ ràng (`Thấp` / `Trung bình` / `Cao`).

