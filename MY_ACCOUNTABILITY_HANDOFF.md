# My Accountability Registry Handoff

## Purpose

This file captures the context and implementation plan for a future Codex session.
The user wants a new "My Accountability" registry that replaces the need to use
"Show self" in Accountability Map or inspect their own person row there.

The change is a UI/workflow feature over the existing canonical database model.
Do not add or migrate database tables/columns.

## User Goal

Add a dedicated My Accountability page for assertions assigned to the configured
self identity. It should provide an end-to-end workflow for personal action and
decision assertions from the canonical meeting database.

Actions and decisions must remain cognitively separate:

- Actions are reviewed, reassigned, marked done, and tracked on a kanban board.
- Decisions are reviewed and then shown as a decision log.

The feature should aggressively reuse and extract React UI controls from:

- Accountability Map
- My Work

The user explicitly asked for reusable React controls, test-guided implementation,
and no regressions in existing behavior.

## Confirmed Product Decisions

These were selected during planning:

- Page shape: add a new workspace page, recommended route `/my-accountability`.
- Approved items stay visible in My Accountability.
- Use existing `action_assertions.status` to persist the canonical action kanban
  status.
- Stored action board statuses are:
  - `todo`
  - `next`
  - `in_progress`
  - `done`
- Null, unknown, or legacy action statuses display as `todo`.
- Clicking "mark as done" on a pending action should both accept the assertion and
  set the action status to `done`.
- Decisions should render as "pending then log":
  - Pending assigned decisions first, with approve/reject controls.
  - Accepted assigned decisions afterward as a chronological log.
- Add Vitest + React Testing Library for React component tests.

## Current Repo Facts

Workspace root:

`/Users/fonkey-oc/.openclaw/openclaw-mission-control`

Important files:

- `apps/web/app/page.tsx`
  - Builds workspace content for My Work, My Meetings, Accountability Map,
    Identity Admin, and Ops.
  - Loads `loadObsidianTaskBoard()`, `loadMeetingIndex()`, and `buildMyntIndex()`.
- `apps/web/app/components/workspace-shell.tsx`
  - Defines `WorkspaceId = "work" | "meetings" | "accountability" | "identity" | "ops"`.
  - Add a new `my-accountability` workspace id and nav entry here.
- `apps/web/app/work/page.tsx`
  - Existing My Work route.
- `apps/web/app/accountability/page.tsx`
  - Existing Accountability Map route.
- `apps/web/app/components/tasks-board.tsx`
  - Existing My Work kanban board.
  - Currently monolithic and Obsidian-specific.
  - Columns are `backlog`, `inbox`, `next`, `waiting`, `done`.
  - Uses `/api/actions/move-obsidian-task`, `/api/actions/mark-obsidian-tasks-done`,
    `/api/actions/archive-obsidian-tasks`, and `/api/actions/save-obsidian-task`.
- `apps/web/app/components/mynt-view.tsx`
  - Existing Accountability Map people table and expanded action/decision lanes.
  - Contains the `Show self` toggle that should be removed.
  - Contains duplicated accept/reject/reassign logic.
- `apps/web/app/components/assertion-register.tsx`
  - Existing accountability action/decision register table.
  - Contains duplicated accept/reject/reassign logic.
- `apps/web/app/components/action-reassign-control.tsx`
  - Existing reusable action reassignment control.
- `apps/web/app/api/meeting-review/route.ts`
  - Current accept/reject/reassign API.
  - Accept sets `review_status='accepted'`.
  - Reject deletes assertion rows and evidence rows.
  - Reassign updates `action_assertions.raw_assignee`.
- `apps/web/app/lib/mynt.ts`
  - Builds Mynt/accountability index from meeting assertions.
  - Has self identity defaults:
    - `francesco@lunarrails.io`
    - `Francesco Vivoli`
  - `MyntItem.status` comes from action assertion status.
  - `buildMyntIndexFromState()` currently uses `state.showSelfDefault` to decide
    whether `people` includes self, while `peopleWithSelf` always includes self.
- `apps/web/app/lib/meetings.ts`
  - Loads canonical meeting/action/decision assertions from DB and maps DB rows
    into `MeetingReviewItem`.
- `packages/db/src/schema.ts`
  - Existing schema includes `action_assertions.status` and `review_status`.
  - No new DB schema should be added.
- `packages/db/src/sqlite.ts`
  - Contains package-level versions of accept/reject/reassign helpers.

Current package scripts:

- Root:
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm ci`
- Web currently has no test script.
- Worker uses `tsx --test`.

## Important Existing Model Details

`action_assertions` has:

- `status TEXT`
- `review_status TEXT NOT NULL`
- `raw_assignee TEXT`
- `due_date TEXT`
- `due_text TEXT`
- `task_id TEXT`
- `details_ref TEXT`

`decision_assertions` has:

- no action workflow status
- `review_status TEXT NOT NULL`
- `raw_owner TEXT`

Current review status normalization only returns:

- `needs_review`
- `accepted`

Reject is destructive in the current implementation. Keep this behavior unless
the user later asks to change it.

## Implementation Plan

### 1. Add My Accountability Workspace

Add a route:

- `apps/web/app/my-accountability/page.tsx`

It should call `MissionControlPage` with a new active workspace id, for example:

- `activeWorkspace="my-accountability"`

Update `WorkspaceShell`:

- Extend `WorkspaceId` with `"my-accountability"`.
- Add a nav item:
  - label: `My Accountability`
  - href: `/my-accountability`
- Add a `myAccountability` content prop, or refactor shell props cleanly.

Update `MissionControlPage` in `apps/web/app/page.tsx`:

- Build a new `myAccountability` content branch.
- Keep existing My Work and Accountability Map available.

### 2. Remove Show Self From Accountability Map

In `mynt-view.tsx`:

- Remove the `showSelf` state and toolbar checkbox.
- Always filter self out of the visible people in Accountability Map.
- Keep `pendingReviewOnly` behavior for non-self people.

In `lib/mynt.ts`:

- Keep `peopleWithSelf` for counts, identity admin, and My Accountability.
- Make `people` always team/non-self people.
- Keep `showSelfDefault` in persisted state for compatibility, but stop using it
  to decide the default UI view.

Update dashboard metric copy:

- Remove or revise text like "self-owned items behind toggle".

### 3. Add Self-Scoped Data Helpers

Add helpers in `apps/web/app/lib/mynt.ts` or a new adjacent module:

- `isSelfMyntItem(item)` or self filtering based on `item.person.isSelf`.
- `normalizeActionWorkflowStatus(status)`:
  - returns `todo`, `next`, `in_progress`, or `done`.
  - returns `todo` for null/unknown/legacy values.
- `buildMyAccountabilityModel(index)`:
  - `pendingActions`: self action items with `reviewStatus="needs_review"`.
  - `acceptedActions`: self action items with `reviewStatus="accepted"`.
  - `actionColumns`: accepted actions grouped by normalized status.
  - `pendingDecisions`: self decision items with `reviewStatus="needs_review"`.
  - `decisionLog`: self decision items with `reviewStatus="accepted"`, newest first.

Use `myntIndex.items` as the source because it includes archived and self data.
Filter out archived items unless a later product decision says history should
include archived.

### 4. Extract Reusable Assertion Review Controls

Avoid continuing duplication in `mynt-view.tsx`, `assertion-register.tsx`, and
new My Accountability components.

Suggested extractions:

- Shared types:
  - `ReviewOperation = "accept" | "reject"`
  - `ReviewPayloadItem = { kind: "action" | "decision"; assertionId: string }`
- Shared client hook/helper:
  - post review requests to `/api/meeting-review`
  - post reassign requests to `/api/meeting-review`
  - manage pending/message state
- Shared visual controls:
  - review status badge
  - approve/reject buttons
  - assertion meta block
  - assertion card shell
  - decision card variant reused by Accountability Map and My Accountability

Keep `ActionReassignControl` as the reassignment input control and reuse it.

### 5. Extract Reusable Kanban Components From My Work

`tasks-board.tsx` is currently Obsidian-specific. Extract generic board UI while
preserving current My Work behavior.

Suggested shape:

- Generic board component:
  - columns: `{ id, label }[]`
  - items grouped by `status`
  - `getItemId`
  - `renderCard`
  - `onMove(itemId, nextStatus)`
  - optional column actions
  - optional empty text
  - optional pending state
- Generic icon button / badge controls, or move them to a shared file if reused.
- My Work adapter keeps existing task-specific filters, modal editor, and API
  endpoints.
- My Accountability adapter uses the same board shell with action assertion cards.

Do not change My Work visible behavior while extracting.

### 6. Add Canonical Action Status API

Extend `apps/web/app/api/meeting-review/route.ts` or add a focused endpoint.
The smallest change is extending `/api/meeting-review`.

New operations:

- `update_action_status`
  - input: `{ operation: "update_action_status", assertionId, status }`
  - validates status is one of `todo | next | in_progress | done`
  - updates `action_assertions.status`
  - allowed for actions with `review_status IN ('needs_review', 'accepted', 'imported')`
- `mark_action_done`
  - input: `{ operation: "mark_action_done", assertionId }`
  - sets `review_status='accepted'`
  - sets `status='done'`
  - should be transactional

Existing operations must keep working:

- `accept`
- `reject`
- `reassign_action`

Consider moving duplicated SQL helper logic out of the route into a shared module
only if it stays scoped and does not balloon the change.

### 7. My Accountability Actions UI

The page should include an Actions section separate from Decisions.

Actions review inbox:

- Show self-assigned pending action assertions.
- Each card should support:
  - Approve
  - Reject
  - Reassign
  - Mark as done
  - Open in My meetings
- Reassign updates `raw_assignee`; after success the item should leave the local
  self view and later appear under the target person in Accountability Map.

Actions board:

- Show accepted self-assigned actions in four columns:
  - To do (`todo`)
  - Next (`next`)
  - In Progress (`in_progress`)
  - Done (`done`)
- Drag/drop and/or status select updates `action_assertions.status`.
- Card should show:
  - summary
  - meeting title/date
  - due date/text if present
  - task id/details ref if present
  - review/status badge
  - reassign control
  - mark done control when not already done
  - link to meeting item

### 8. My Accountability Decisions UI

Decisions section must not mix with actions.

Pending decisions:

- Show self-owned decision assertions with `reviewStatus="needs_review"`.
- Controls:
  - Approve
  - Reject
  - Open in My meetings
- No reassign unless the user later asks for decision reassignment.

Decision log:

- Show self-owned accepted decisions newest first.
- Reuse the Accountability Map decision item/card renderer.
- Include meeting title/date, confidence/score if available, evidence timestamp,
  and link to the meeting item.

### 9. Tests

Add Vitest + React Testing Library to `apps/web`.

Likely package additions:

- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`

Add web scripts:

- `"test": "vitest run"`
- optionally `"test:watch": "vitest"`

Add config as needed:

- `apps/web/vitest.config.ts`
- test setup file if using jest-dom matchers

Pure helper tests:

- self filtering includes only `person.isSelf`.
- action status normalization maps null/unknown/legacy to `todo`.
- accepted self actions group into `todo`, `next`, `in_progress`, `done`.
- pending and accepted decisions partition correctly.
- Accountability Map people exclude self after cleanup.

React/component tests:

- My Work still renders its existing board columns after extraction.
- Generic kanban invokes `onMove` with the dragged item and target status.
- My Accountability renders:
  - pending action review area
  - four action board columns
  - decisions pending area
  - decision log
- Pending action "Mark as done" calls the combined done operation.
- Decisions do not show action-only reassign/status controls.

API/helper tests:

- `update_action_status` rejects invalid statuses.
- `update_action_status` persists valid status.
- `mark_action_done` accepts a pending assertion and sets `status='done'`.
- `reassign_action` still updates assignee.

Run before finishing:

- `pnpm --filter @ocmc/web test`
- `pnpm typecheck`
- `pnpm build`

## Regression Risks To Watch

- My Work board extraction must not change existing Obsidian task behavior or
  endpoints.
- Existing Accountability Map action/decision review controls should keep working.
- Existing Accountability action/decision register pages should keep working:
  - `/accountability/actions/all`
  - `/accountability/actions/pending`
  - `/accountability/actions/accepted`
  - `/accountability/decisions/all`
  - `/accountability/decisions/pending`
  - `/accountability/decisions/accepted`
- Removing Show self should not break identity admin or hidden/self counts.
- Since `action_assertions.status` used to hold extracted metadata like `created`,
  make the UI normalization forgiving and validate only new writes.

## Suggested First Commands For New Session

```sh
rg -n "Show self|showSelf|WorkspaceId|TasksBoard|MyntView|AssertionRegister|meeting-review" apps/web/app
sed -n '1,220p' apps/web/app/components/workspace-shell.tsx
sed -n '1,520p' apps/web/app/components/mynt-view.tsx
sed -n '1,340p' apps/web/app/components/assertion-register.tsx
sed -n '1,240p' apps/web/app/api/meeting-review/route.ts
sed -n '1,460p' apps/web/app/lib/mynt.ts
sed -n '1,220p' apps/web/app/components/tasks-board.tsx
```

## Acceptance Criteria

- New `My Accountability` workspace is reachable from top navigation.
- It shows only self-assigned/self-owned canonical assertions.
- Actions and decisions are visually and behaviorally separate.
- Pending actions can be approved, rejected, reassigned, or marked done.
- Accepted actions appear on a persistent four-column board.
- Moving an action persists to `action_assertions.status`.
- Pending action "mark as done" both accepts and marks done.
- Pending decisions can be approved or rejected.
- Accepted decisions appear in a decision log.
- Reassigning an action moves it out of self view and into the target person's
  Accountability Map list.
- Accountability Map no longer has a Show self filter.
- My Work still behaves as before.
- Tests cover the new helpers/components and guard the extracted board behavior.
