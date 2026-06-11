# Feature: Agent-Attributed Plan

**Status**: done
**Branch**: feature/agent-attributed-plan

Drop the file-based INDEX.md plan; make the HUD panels reflect live agents.
Agents = each agent + its current task (already present). Plan = todo lists
grouped per owner (main session + each subagent), routed by the todo event's
`parentId`. Activity unchanged.

## Tasks

| ID | Task | Status | Assignee |
|----|------|--------|----------|
| 001 | Remove file-plan (Rust `read_task_plan` + `FeaturePlan`/`PlanTask` + `Project.plan`); add `Subagent.todos`; route `applyTodo` by `parentId` | done | orchestrator (inline) |
| 002 | Rebuild `TodoPanel` as per-agent todo groups (color-keyed to agent cards) | done | orchestrator (inline) |

## Decisions
- Implemented inline (not via cold worktree agents) — warm context, small cohesive change.
- Agents panel left as-is: `SubagentCard.now` + main-session `activity` already show "current task".
- No unit-test harness in this project → acceptance = `svelte-check` clean + smoke test.
