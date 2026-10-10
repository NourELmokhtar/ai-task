# Requirements Analysis

| Field | Value |
|---|---|
| Source | `requirements/PRD.md` (QuickFlow MVP PRD) |
| Input type | Full PRD |
| Analyzed | 2026-10-10 |
| Produced by | Orchestrator — planning stage (Stages 1–5) |

---

## 1. Product Summary

QuickFlow is a single-user personal productivity app with six pages that can each be reached from persistent navigation: **Dashboard, Tasks, Habits, Learning Resources, Todo Plans, Settings**.

The main feature is **Todo Plans**. A plan is a time-boxed block of work built from existing tasks, habits and learning cards. Each plan has an estimated duration, a start/end date-time and a priority order. The app tracks each plan's progress (done items / total items) and its live remaining ("rest") time, and the Dashboard summarizes everything.

The PRD lists these as non-goals: multi-user/team, authentication, external calendars, file attachments, real-time chat and AI.

---

## 2. Requirement Identifiers (used for traceability in module specs)

### 2.1 Functional Requirements
| ID | Title |
|---|---|
| FR-01 | Task Management (CRUD, archive, restore) |
| FR-02 | Task Search and Filtering (search, status, priority, due date, sort) |
| FR-03 | Habit Management (create, update, deactivate, delete) |
| FR-04 | Habit Completion (per date, no duplicates) |
| FR-05 | Learning Resources (cards: add/remove) |
| FR-06 | Learning Milestones and Notes |
| FR-07 | Plan Composition (Todo Plans) |
| FR-08 | Plan Progress and Rest Time |
| FR-09 | Dashboard |

### 2.2 User Stories
| ID | Story |
|---|---|
| US-T1..T7 | Task: create · edit · mark completed · delete/archive · filter status+priority · search · see overdue |
| US-H1..H5 | Habit: create recurring · daily/weekly · complete today · see completion progress · remove |
| US-L1..L5 | Learning: add card · remove card · add milestones · complete milestones · attach notes |
| US-P1..P10 | Plan: create from existing items · estimated time · start/end · priority order · mark items done · remove · notified at start · live rest time · completion progress · history of past plans |
| US-D1..D6 | Dashboard: today's tasks on open · overdue tasks · today's habits · completion % · active plans + rest time · learning snapshot |

### 2.3 Acceptance Criteria
| ID | Criterion |
|---|---|
| AC-T1 | Create, edit, complete, archive, delete a task |
| AC-T2 | Required fields validated |
| AC-T3 | Search and filters work |
| AC-T4 | Overdue tasks identified correctly |
| AC-H1 | Create daily or weekly habit |
| AC-H2 | Complete habit for today; duplicate for same date prevented |
| AC-H3 | Deactivate or remove a habit |
| AC-L1 | Add and remove a learning card |
| AC-L2 | Add, complete, remove milestones |
| AC-L3 | Add and remove notes |
| AC-P1 | Create plan from existing tasks/habits/learning resources |
| AC-P2 | Set estimated duration, start/end date-time, priority order |
| AC-P3 | Mark plan items done → plan progress updates |
| AC-P4 | Remove a plan |
| AC-P5 | Notified when plan start time is reached |
| AC-P6 | Rest time visibly counts down from start to end |
| AC-P7 | Progress % = done items / total items |
| AC-P8 | Item-level changes reflected in plan view **and** dashboard |
| AC-D1 | Today's tasks, overdue tasks, today's habits displayed |
| AC-D2 | Completion metrics match underlying data |
| AC-D3 | Active plans show live progress and rest time |
| AC-D4 | Learning snapshot reflects current card/milestone state |

### 2.4 UX Requirements
| ID | Area |
|---|---|
| UX-NAV | Persistent main navigation with six entries |
| UX-DASH | Greeting, metric cards, today's tasks, habit checklist, active plans, quick-add |
| UX-TASKS | Search, status/priority filters, Add Task, list with edit/delete/archive, empty state |
| UX-HABITS | Add Habit, cards with completion toggle, frequency label, streak, edit/deactivate/remove, empty state |
| UX-LEARN | Add card, expandable card grid with milestones + notes, add/remove controls, empty state |
| UX-PLANS | Plan builder (pick items), duration/start/end/priority fields, active/upcoming vs completed groups, progress + live rest time, item toggles, remove, start notification/highlight, empty state |
| UX-SETTINGS | Profile info, app preferences (notification behavior, default view) |

### 2.5 Non-Functional, Testing, Definition of Done
| ID | Requirement |
|---|---|
| NFR-P1 | Typical actions < 500 ms |
| NFR-P2 | Rest time updates ≥ once per minute while in progress |
| NFR-R1 | State persists between sessions |
| NFR-R2 | Plan status transitions computed consistently from stored data, even after reopen |
| NFR-U1 | Each list page supports add/remove directly |
| NFR-U2 | Empty states guide to the "add" action |
| NFR-M1 | Domain/business rules testable and separated from presentation |
| NFR-M2 | No duplicated completion-state logic between plan item and source entity beyond FR-08/BR-13 |
| TR-1 | Unit tests for business rules (task/habit/plan validation, rest time, completion roll-up) |
| TR-2 | Tests for plan progress + rest-time across NotStarted → InProgress → Completed |
| TR-3 | Tests that dashboard metrics match underlying data |
| TR-4 | E2E: create task → complete task → create habit → complete habit → learning card with milestones → build plan → mark items done → verify plan + dashboard |
| DOD-1 | All six pages implemented and reachable from persistent navigation |
| DOD-2 | Tasks, habits, learning resources added/removed from their pages |
| DOD-3 | Learning cards support milestones and notes |
| DOD-4 | Plans built from existing items with duration, start/end, priority |
| DOD-5 | Plan/item completion drives plan progress, rest time, dashboard |
| DOD-6 | Automated tests pass |

---

## 3. Entities and Relationships

| Entity | Fields (PRD) | Derived/added fields (see §6) | Owner module |
|---|---|---|---|
| Task | Id, Title, Description, Status, Priority, DueDate, CreatedAt, UpdatedAt, IsArchived | CompletedAt (A-06) | M02 |
| Habit | Id, Name, Description, Frequency, CreatedAt, IsActive | — | M03 |
| HabitCompletion | Id, HabitId, CompletionDate, CreatedAt | — | M03 |
| LearningCard | Id, Title, Description, Status, CreatedAt | — | M04 |
| LearningMilestone | Id, LearningCardId, Title, IsDone, TargetDate | CompletedAt (A-13) | M04 |
| LearningNote | Id, LearningCardId, Text, CreatedAt | — | M04 |
| UserSettings | *(not in PRD data model)* | DisplayName, PlanStartNotificationsEnabled, DefaultView (A-03) | M05 |
| Plan | Id, Title, EstimatedDuration, StartDateTime, EndDateTime, PriorityOrder, Status, CreatedAt | — | M06 (status lifecycle: M07) |
| PlanItem | Id, PlanId, SourceType (Task \| Habit \| LearningResource), SourceId, IsDone | — | M06 |

The M01 base-entity convention gives every entity soft-delete fields (A-04). An entity gets audit timestamps only where it needs them.

**Relationships:** Habit 1:N HabitCompletion · LearningCard 1:N LearningMilestone · LearningCard 1:N LearningNote · Plan 1:N PlanItem · PlanItem N:1 Task/Habit/LearningCard (polymorphic by SourceType + SourceId, no FK).

**Unique constraints:** (HabitId, CompletionDate).

---

## 4. Business Rules → Owning Module

| ID | Rule | Module |
|---|---|---|
| BR-01 | Task title required, ≤ 200 chars | M02 |
| BR-02 | Task description optional, ≤ 2,000 chars | M02 |
| BR-03 | Task status/priority must be valid | M02 |
| BR-04 | Archived tasks excluded from default list | M02 |
| BR-05 | Completed task has status Done | M02 |
| BR-06 | Habit name required, ≤ 150 chars | M03 |
| BR-07 | One completion per habit per date | M03 |
| BR-08 | Learning card title required | M04 |
| BR-09 | Milestone belongs to exactly one card | M04 |
| BR-10 | Plan references ≥ 1 existing task/habit/learning item | M06 |
| BR-11 | Plan EndDateTime > StartDateTime | M06 |
| BR-12 | Rest-time display active only between start and end | M07 |
| BR-13 | Plan item done doesn't change source entity, **except** task-type item completes the task | M06 |
| BR-14 | Deleted resources not returned by normal queries | M01 (mechanism) + every feature module |

---

## 5. Cross-Cutting Conventions (proposed; established by M01)

| Concern | Convention |
|---|---|
| API style | REST under `/api`, JSON, camelCase properties |
| Enums | Serialized as strings (`"Todo"`, `"InProgress"`, `"Done"`, `"Daily"`, `"LearningResource"` …); invalid values → 400 |
| Dates | Date-only fields (`DueDate`, `CompletionDate`, `TargetDate`) as `YYYY-MM-DD`; timestamps stored in UTC as ISO-8601 |
| "Today" | Date-relative endpoints accept an optional `today=YYYY-MM-DD` query param (for deterministic testing); the default is the server's local date. The server and client are assumed to share a time zone (single-user, local app) |
| Errors | RFC 7807 ProblemDetails. 400 validation (with `errors` field map), 404 not found, 409 conflict |
| Success codes | 201 + `Location` on create, 200 on read/update/action, 204 on delete |
| Deletion | Soft delete (`IsDeleted`, `DeletedAt`) plus a global query filter, which satisfies BR-14 |
| Database (MySQL) | Charset `utf8mb4` with a case-insensitive default collation, so title/name search is case-insensitive. Timestamps stored as UTC in `datetime(6)`. Date-only fields in `date`. Dev database `quickflow`, E2E database `quickflow_e2e`. The connection string comes from user-secrets or an env var and is **never committed** |
| IDs | Integer identity keys |
| Time-based logic | Uses an injected clock abstraction. Domain code never reads the system clock directly (NFR-M1, TR-2) |
| Layering | API layer → application/domain services (all business rules) → persistence. Rules are unit-testable without HTTP (NFR-M1) |
| Auth | None (single user, A-02) |
| Pagination | None for MVP lists (A-29) |

---

## 6. Ambiguities and Assumptions

Each item applies the smallest reasonable assumption. The module that owns it implements it, and the backend handoff should confirm it.

| ID | Ambiguity | Assumption applied | Module |
|---|---|---|---|
| A-01 | Tech stack not specified | Resolved by user decision **D-01** (.NET + MySQL + Angular) | M01 |
| A-02 | Settings mentions "user/account" but no auth exists | No authentication. Profile = `DisplayName` only | M05 |
| A-03 | Settings has no data model | Single-row `UserSettings`: `DisplayName` (optional, ≤ 100), `PlanStartNotificationsEnabled` (bool, default true), `DefaultView` (one of six pages, default Dashboard) | M05 |
| A-04 | BR-14 delete semantics | Soft delete + global query filter. Lets plan history still show a removed source's title | M01 |
| A-05 | Definition of "overdue" / "due today" | Overdue = `DueDate < today` AND `Status ≠ Done` AND not archived. Due today = `DueDate == today` AND not archived (any status) | M02 |
| A-06 | FR-09 "Completed tasks today" needs a completion time | Add nullable `Task.CompletedAt`, set when status becomes Done and cleared when it leaves Done | M02 |
| A-07 | FR-01 "restore" needs a way to see archived tasks | List filter `archived=true`. Restore sets `IsArchived=false` | M02 |
| A-08 | Defaults for task Status/Priority | Status defaults to `Todo`, Priority defaults to `Medium` when omitted | M02 |
| A-09 | Weekly habit semantics | Week = ISO week (Mon–Sun). Weekly habit is "done for current period" if any completion exists in the current week. Completions are still per-date (BR-07) | M03 |
| A-10 | "Completion progress" / streak | `currentStreak` = consecutive periods (days or ISO weeks) with ≥ 1 completion, counted back from the current period (or the previous period if the current one isn't done yet). Plus `completedToday` and `completedForCurrentPeriod` | M03 |
| A-11 | Completion toggle / inactive habits / future dates | Toggle can remove a date's completion. Completing an inactive habit → 400. Completion date in the future → 400. Inactive habits can be re-activated | M03 |
| A-12 | Learning card status is listed but no story changes it | Status is set by the user through a minimal card update (title/description/status). It is not derived from milestones | M04 |
| A-13 | FR-09 "milestones completed recently" needs a timestamp | Add nullable `LearningMilestone.CompletedAt`. "Recently" = last 7 days | M04 |
| A-14 | Unspecified lengths | Card/milestone/plan title ≤ 200, card/habit description ≤ 2,000, note text required ≤ 4,000 | M03, M04, M06 |
| A-15 | EstimatedDuration unit | Integer minutes, > 0. Not validated against the start/end window | M06 |
| A-16 | PriorityOrder semantics | Integer ≥ 1, lower = higher priority. Duplicates allowed. Lists sort by PriorityOrder, then StartDateTime | M06 |
| A-17 | Editing plans | Plan metadata (title, duration, start/end, priority) is editable. Items are fixed at creation (MVP). No duplicate (SourceType, SourceId) in one plan | M06 |
| A-18 | Which sources may be selected | API rejects sources that don't exist or were deleted. Builder UI lists non-archived tasks, active habits and all learning cards | M06 |
| A-19 | BR-13 details | Task-type item → done sets the task to `Done` (reusing the M02 completion logic). Un-marking does **not** revert the task. Habit/learning items change only the item flag. No reverse sync from source to item | M06 |
| A-20 | Plan status rule | Derived from stored data plus the clock: all items done → `Completed`; else now < start → `NotStarted`; start ≤ now < end → `InProgress`; now ≥ end → `Completed` (partial completion % kept for history). Recomputed on every read, so it stays correct after restart (NFR-R2) | M07 |
| A-21 | Rest time definition | `restTimeSeconds = EndDateTime − now` only while status = `InProgress`, otherwise null (BR-12). Client ticks locally (≥ 1/min, NFR-P2) and corrects for clock skew using `serverNow` | M07 |
| A-22 | Notification mechanism | In-app only (toast + highlight). A global watcher in the app shell fires once per plan when its start is reached, including plans that started while the app was closed and are still in progress. Notified IDs are remembered on the client. The watcher respects `PlanStartNotificationsEnabled` | M07 |
| A-23 | Plan history | History = plans with status `Completed`, showing completion %, ordered by EndDateTime desc | M07 |
| A-24 | Source deleted after plan creation | Plan item is kept, shown with the source title and `sourceAvailable=false`, and still counts toward progress | M06 |
| A-25 | Dashboard "task completion percentage" | `Done` non-archived tasks ÷ all non-archived tasks × 100 (0 when there are no tasks) | M08 |
| A-26 | Dashboard "today's habits" | Active habits, each with `completedToday` (weekly habits also show `completedForCurrentPeriod`) | M08 |
| A-27 | Learning snapshot content | Card counts by status, milestones done/total, milestones completed in last 7 days | M08 |
| A-28 | Dashboard "quick-add actions" | Reuse the create dialogs for task/habit/learning card. Plan quick-add goes to the plan builder | M08 |
| A-29 | Pagination | Not required for MVP | all |
| A-30 | "See today's tasks immediately after opening the app" | `/` goes to `Settings.DefaultView`, which defaults to Dashboard | M01, M05 |
| A-31 | Live updates | No push channel. The frontend refreshes after actions, on navigation, on window focus, and polls every ≤ 60 s where live data is shown | M07, M08 |

---

## 7. Open Decisions

| ID | Decision | Blocking? | Proposed default / resolution |
|---|---|---|---|
| **D-01** | **Technology stack** | ✅ **Decided by user (2026-10-10)** | **.NET + MySQL + Angular.** Full details in §7.1 |
| **D-05** | **MySQL connection credentials** for databases `quickflow` and `quickflow_e2e` | ✅ **Resolved (2026-10-10)** | User supplied the account (the `root` user). Login verified against MySQL 9.7.0 on `localhost:3306`. Stored **outside the workspace** in user-secrets id `quickflow-api-dev` as `ConnectionStrings:QuickFlow` and `ConnectionStrings:QuickFlowE2E`. The password is not written in any project or plan file |
| D-02 | Added fields not in the PRD data model (A-03 `UserSettings`, A-06 `Task.CompletedAt`, A-13 `LearningMilestone.CompletedAt`) | No | Accept: each is required to satisfy FR-09 / Settings page |
| D-03 | BR-13 propagation (A-19) and plan status rule (A-20) | No | Accept as written |
| D-04 | Workspace is **not a git repository**. Parallel loops editing the same project can't be isolated or reverted | No (risk) | Run `git init` before execution. Run backend modules sequentially in one lane (shared DbContext/migrations) |

### 7.1 Confirmed Technology Stack (D-01)

| Layer | Choice | Environment check (2026-10-10) |
|---|---|---|
| Backend | ASP.NET Core Web API on **.NET 10** (LTS) | SDK 10.0.401 installed (8.0.425 also present) |
| ORM | EF Core + MySQL provider (Pomelo `Pomelo.EntityFrameworkCore.MySql` or Oracle `MySql.EntityFrameworkCore`) | — |
| Database | **MySQL** | MySQL Server 9.7 installed, service `MySQL97` running, port 3306 open. `mysql` CLI not on PATH (located under `C:\Program Files\MySQL\MySQL Server 9.7\bin`). MySQL Workbench 8.0 installed |
| Migrations tool | `dotnet-ef` as a **local tool** (tool manifest in `backend/`) matching the EF Core version | Global `dotnet-ef` is 8.0.8, which is too old for EF Core 9/10 |
| Backend tests | xUnit | — |
| API docs | OpenAPI + Swagger UI | — |
| Frontend | **Angular** (standalone components, Angular Router, `HttpClient`, signals for state) | Angular CLI 20.3.8 installed globally. Node 24.11.0, npm 11.6.1 |
| Frontend unit tests | Angular CLI default test runner | — |
| E2E | Playwright (test runner for M09; Playwright MCP for loop verification) | — |
| Dev URLs | Frontend `http://localhost:4200` (Angular default). Backend fixed port chosen in M01 and recorded in its handoff | — |

**Provider compatibility rule (for M01-BE):** pick the newest EF Core version that has a **stable** MySQL provider release that works with MySQL 9.7. If no stable provider supports EF Core 10 yet, use EF Core 9 on .NET 10 (EF Core 9 runs on .NET 10). If the provider doesn't recognise server version 9.7, set the server version explicitly. Record the chosen package versions in the M01 handoff.

---

## 8. Requirement → Module Coverage Matrix

| Requirement | M01 | M02 | M03 | M04 | M05 | M06 | M07 | M08 | M09 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| FR-01, FR-02 | | ● | | | | | | | ✓ |
| FR-03, FR-04 | | | ● | | | | | | ✓ |
| FR-05, FR-06 | | | | ● | | | | | ✓ |
| FR-07 | | | | | | ● | | | ✓ |
| FR-08 | | | | | | ◐ (progress %) | ● | ◐ | ✓ |
| FR-09 | | | | | | | | ● | ✓ |
| BR-01..05 | | ● | | | | | | | |
| BR-06..07 | | | ● | | | | | | |
| BR-08..09 | | | | ● | | | | | |
| BR-10, 11, 13 | | | | | | ● | | | |
| BR-12 | | | | | | | ● | | |
| BR-14 | ● | ● | ● | ● | | ● | | | |
| UX-NAV | ● | | | | ◐ (default view) | | | | ✓ |
| UX-TASKS / HABITS / LEARN | | ● | ● | ● | | | | | |
| UX-PLANS | | | | | | ● (builder, list, toggles) | ● (groups, rest time, notify) | | |
| UX-SETTINGS | | | | | ● | | | | |
| UX-DASH | | | | | ◐ (greeting) | | | ● | |
| NFR-P1 | ◐ | ◐ | ◐ | ◐ | | ◐ | | | ● (check) |
| NFR-P2, NFR-R2 | | | | | | | ● | ◐ | |
| NFR-R1 | ● | | | | ● | | | | |
| NFR-U1, NFR-U2 | ◐ (shared EmptyState) | ● | ● | ● | | ● | | ◐ | ✓ |
| NFR-M1 | ● | ● | ● | ● | ● | ● | ● | ● | |
| NFR-M2 | | ◐ (reusable completion) | | | | ● | ● | ● | |
| TR-1 | ◐ (test project) | ● | ● | ● | | ● | ● | | ✓ |
| TR-2 | | | | | | | ● | | ✓ |
| TR-3 | | | | | | | | ● | ✓ |
| TR-4 | | | | | | | | | ● |
| DOD-1..6 | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ● (sign-off) |

● primary owner · ◐ partial contribution · ✓ regression-verified

Every FR, BR, US, AC, UX, NFR, TR and DoD item maps to at least one module.
