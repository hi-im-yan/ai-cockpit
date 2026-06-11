# Feature: Blank Project (repo-less scratch session)

**Status**: done
**Branch**: feature/blank-project

Let a user create a project with no repo — "open a prompt and start from 0".
The session runs in a clean scratch dir `~/.ai-cockpit/scratch/<project-id>`.

## Tasks

| ID | Task | Status | Assignee |
|----|------|--------|----------|
| 001 | Rust `scratch_dir(id)` command (mkdir `~/.ai-cockpit/scratch/<id>`, return path) + register | in-progress | orchestrator (inline) |
| 002 | `createBlankProject(name)` (async, repos=[], scratch cwd); keep cwd in `normalizeProject` when repo-less | in-progress | orchestrator (inline) |
| 003 | NewProjectModal "Start blank session" path; Chat header shows "✨ scratch" when no repos | ready | orchestrator (inline) |

## Decisions
- cwd for blank projects = per-project scratch dir `~/.ai-cockpit/scratch/<id>` (isolated, "from 0").
- Implemented inline (warm context, small change). Acceptance = svelte-check + cargo check clean + smoke.
