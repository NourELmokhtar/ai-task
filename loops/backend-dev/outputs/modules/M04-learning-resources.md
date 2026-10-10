# M04 Learning Resources: Backend Module Output

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Attempts | 1 (no failed build or runtime step; one unit test fixed during the first run, see Attempts) |
| Start / end | 2026-10-10 15:48 UTC / 15:57 UTC |
| Dependencies | M01-BE `COMPLETED` |
| Handoff | `../../../orchestrator/outputs/handoffs/M04-learning-resources-handoff.md` (READY) |
| Migration | `20261010155041_AddLearningResources` (tables `LearningCards`, `LearningMilestones`, `LearningNotes`, FKs to `LearningCards` with cascade, indexes on `LearningCardId`) |
| Tests | 165/165 pass (119 existing + 46 new) |

## Tasks

| # | Task | Status | Implementation |
|---|---|---|---|
| B1 | Entities, mappings, migration | Done | `LearningCard` (soft-deletable), `LearningMilestone` and `LearningNote` (hard-deleted children), `LearningCardStatus`. Configurations with required FKs and named `SoftDelete` filters `!x.LearningCard.IsDeleted`. `AppDbContext` gets 3 DbSets. Migration `AddLearningResources` |
| B2 | DTOs | Done | `LearningCardSummary` (with counts), `LearningCardDetail` (+ milestones, notes), `LearningMilestoneResponse`, `LearningNoteResponse`, create/update requests for card and milestone, create request for note |
| B3 | Validation | Done | `LearningInputValidator`: BR-08 title, description ≤ 2000, status required on PUT and a valid name, list status filter, A-14 milestone title ≤ 200, `isDone` required on milestone PUT, note text required ≤ 4000 |
| B4 | Service | Done | `ILearningService`/`LearningService`: list (status filter, counts), get, create, update, soft delete. Milestone add/update (A-13 `CompletedAt` via `TimeProvider`)/remove. Note add/remove. BR-09 ownership checks. `ExistsAsync`/`GetTitlesAsync(includeDeleted)` for M06 |
| B5 | Endpoints + OpenAPI | Done | `LearningCardsController` (10 operations, tag `LearningCards`, response types, parameter descriptions) |
| B6 | Unit tests | Done | `tests/QuickFlow.Tests/Learning/*` (46 test cases: validator 25, service 19, persistence 2) |

## Files

Added (all under `backend/`):
- `src/QuickFlow.Application/Domain/Learning/LearningCard.cs`, `LearningCardStatus.cs`, `LearningMilestone.cs`, `LearningNote.cs`
- `src/QuickFlow.Application/Features/Learning/LearningDtos.cs`, `LearningInputValidator.cs`, `ILearningService.cs`, `LearningService.cs`
- `src/QuickFlow.Infrastructure/Persistence/Configurations/LearningCardConfiguration.cs`, `LearningMilestoneConfiguration.cs`, `LearningNoteConfiguration.cs`
- `src/QuickFlow.Infrastructure/Persistence/Migrations/20261010155041_AddLearningResources.cs` (+ `.Designer.cs`; snapshot updated)
- `src/QuickFlow.Api/Controllers/LearningCardsController.cs`
- `tests/QuickFlow.Tests/Learning/LearningInputValidatorTests.cs`, `LearningServiceTests.cs`, `LearningPersistenceTests.cs`

Modified: `Application/DependencyInjection.cs` (registers `ILearningService`), `Infrastructure/Persistence/AppDbContext.cs` (3 DbSets + using), `README.md` (feature line). No M02/M03 file was changed.

## Unit test coverage (spec TR-1)

| Spec item | Tests |
|---|---|
| card title required | `Card_title_is_required_on_create` (×3), `_on_update`, `Create_card_without_title_throws_and_saves_nothing` |
| milestone title required | `Milestone_title_is_required` (×3, create + update), `Milestone_without_title_is_rejected` |
| note text required / ≤ 4000 | `Note_text_is_required` (×3), `Note_text_max_4000_after_trimming`, `Note_text_required_and_max_4000` (service) |
| milestone via another card → not found | `Milestone_accessed_through_another_card_is_not_found` (update + remove); also `Note_accessed_through_another_card_is_not_found` |
| completing sets `CompletedAt`, un-completing clears it | `Completing_milestone_sets_CompletedAt_and_uncompleting_clears_it` (also: re-sending done keeps the original time) |
| deleting card hides milestones and notes | `Deleting_card_hides_it_with_its_milestones_and_notes` (filters hide children, all child routes 404, rows kept) |
| counts `milestonesDone/Total` correct | `Milestone_counts_are_correct_in_list_and_detail`, `List_filters_by_status` |
| extra | status enum (valid/invalid/required/filter), A-12 status independent of milestones, max lengths, hard delete of milestone/note, note order, M06 helpers, MySQL DDL, `TargetDate` DateOnly converter |

## Verification (executed and observed)

| Check | Command | Result |
|---|---|---|
| Build | `dotnet build QuickFlow.sln --no-incremental` | PASSED: 0 errors, 0 warnings |
| Tests | `dotnet test QuickFlow.sln` | PASSED: 165/165 |
| Pending model changes | `dotnet dotnet-ef migrations has-pending-model-changes …` | None |
| Run | `ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5081` | PASSED: `Applying migration '20261010155041_AddLearningResources'`, listening on 5081 |
| Swagger | `/swagger/index.html`, `/openapi/v1.json` | 200. All 10 operations with status codes (`get,post` / `get,put,delete` / milestones `post` / `put,delete` / notes `post` / `delete`). `LearningCardStatus` enum `[NotStarted, InProgress, Completed]` |
| Curl 1 | POST `"  M04V Clean Code "` + description. POST without title, whitespace title, empty body | 201 + `Location: /api/learning-cards/1`, `status=NotStarted`, title trimmed, empty lists. 400 `errors.title` ×3 |
| Curl 2 | GET list, GET 1 | `milestonesTotal=0`, `milestonesDone=0`. Detail `milestones:[]`, `notes:[]` |
| Curl 3 | PUT status `InProgress`; `Done`; `1`; missing status; list `?status=InProgress`; `?status=Done` | 200 `InProgress`, `updatedAt` changed. 400 `errors.status` (invalid). 400 `$.status`. 400 `Status is required.`. Filter returns card 1. 400 `errors.status` |
| Curl 4 | 2 milestones (one with `targetDate`), blank title, missing title, bad date, card 999 | 201 ×2 (`targetDate` `2026-10-20` read back from MySQL `date`, so the DateOnly converter works at runtime). 400 `errors.title` ×2. 400 `$.targetDate`. 404 |
| Curl 5 | PUT milestone 1 `isDone=true`, list + detail, PUT true again, PUT false, list, PUT without `isDone`, blank title | `completedAt` set. Card `milestonesDone=1` (total 2). Re-sending true keeps the same `completedAt`. false clears it, `milestonesDone=0`. 400 `errors.isDone`. 400 `errors.title` |
| Curl 6 | card 2 created. PUT/DELETE `/2/milestones/1`. PUT `/1/milestones/999` | 404 `Milestone with id '1' was not found on learning card '2'.` ×2, milestone 1 unchanged. 404 |
| Curl 7 | DELETE `/1/milestones/2` twice, list | 204, then 404. `milestonesTotal=1` |
| Curl 8 | note with newline, whitespace text, `{}`, 4001 chars, 4000 chars, second note. DELETE `/2/notes/1`, `/1/notes/2`, `/1/notes/1` twice | 201 with `createdAt` (newline kept). 400 `Text is required.` ×2. 400 `Text must be at most 4000 characters.`. 201. Notes oldest first. 404 (wrong card). 204, 204, then 404. Remaining note 3 |
| Curl 9 | DELETE card 1, GET 1, milestone PUT/DELETE/POST, note POST/DELETE, card PUT/DELETE on 1, list | 204. Then 404 `Learning card with id '1' was not found.` for every route. List shows only card 2 |
| Extra | CORS preflight PUT from `http://localhost:4200`. `GET /api/tasks`, `/api/habits`. `GET /api/learning-cards/abc` | 204 with allow-origin. 200, 200 (M02/M03 unaffected). 404 |
| Secrets | Pattern scan (`password=`, `pwd=`, `uid=`) and a value scan against user-secrets in `backend/` (excl. bin/obj); value never printed | No credential. The 4-letter value appears only as an ordinary word in the same 3 untouched M01 files noted in M02/M03 (`.gitignore`, `README.md`, `SoftDeleteModelBuilderExtensions.cs`), and in no M04 file |
| Cleanup | DELETE card 2 (card 1 already deleted) | `GET /api/learning-cards` returns `[]` for all, `NotStarted`, `InProgress` and `Completed`. Rows remain soft-deleted (ids 1–2). My processes (QuickFlow.Api PID 5848, `dotnet run` PID 28012) were stopped and 5081 is free |

Port 5080: never used or signalled. It was held by PID 8536 (the frontend loop) throughout and was still listening at the end.

## Decisions, assumptions and ambiguities

- **Milestone/note removal is a hard delete.** This is the smallest choice consistent with BR-14 and the M03 precedent (`HabitCompletion`). BR-14 covers the deletable resource (the card). Children are owned rows without their own lifecycle. A soft-deleted card's milestones and notes stay in the DB and are hidden by `SoftDelete` query filters on the child entities, so the card could be restored later.
- `LearningMilestone` has no `CreatedAt`/`UpdatedAt` (not in the spec). Milestones are ordered by `id` (creation order). Notes are ordered by `createdAt` ascending (oldest first, tie-break `id`). `LearningNote.CreatedAt` is set by the service from `TimeProvider` (notes are not `IAuditable`).
- Card list without `status` returns all cards, ordered by `createdAt` ascending. An invalid `status` gives 400 `errors.status`.
- `status` is a string validated in the service (as in M02/M03), so an invalid name gives `errors.status`. It is required on PUT (full replacement) and not accepted on POST (cards start `NotStarted`).
- Milestone PUT is a full replacement: `isDone` is required (400 `errors.isDone`), and an omitted `targetDate` is cleared. Re-sending `isDone=true` on a done milestone keeps the original `completedAt` (A-13 "set when it becomes done"). `targetDate` has no range validation (past dates are allowed).
- Titles and note text are trimmed. Inner whitespace and newlines in notes are kept. Length limits apply after trimming. Description is not trimmed, and whitespace-only becomes null (M02/M03 behavior).
- Milestone and note mutations return the child object, not the card. POST `Location` points to the parent card, since there are no single-child GET routes.
- Card `updatedAt` changes only on card PUT, not on milestone/note changes (the smallest choice).
- `GetTitlesAsync` has an `includeDeleted` flag (default false, same semantics as `IHabitService.GetNamesAsync`) for M06 A-24 ("title resolved ignoring the soft-delete filter"). It filters in memory, like M03. No dedicated M08 method was added. The handoff documents the query on `LearningMilestone.CompletedAt`.
- The FKs use `Cascade` (as in M03). Rows are never hard-deleted at card level, so this only matters in the database. EF's client-side cascade could mark tracked children deleted if they are loaded in the same context as a card delete. `DeleteAsync` loads only the card, so this cannot happen through the API.
- Timestamps on POST responses have 7 fractional digits (in-memory value). Values read back from `datetime(6)` have 6. This is the same as M02/M03.

## Attempts

1. On the first test run, `Deleting_card_hides_it_with_its_milestones_and_notes` failed (expected 2 stored milestones, got 1). Cause: the test removed the card in the same `DbContext` that still tracked the milestone created earlier, so EF's client-side cascade hard-deleted it. This is a test-setup artifact. In the API every request has a new scope, and `DeleteAsync` loads only the card. Fix: the test clears the change tracker (new request scope) before the delete. Then 165/165 passed. Build, runtime and curl verification all passed on the first run. Also, the first `dotnet build` ran in parallel with writing the controller, so a `--no-incremental` rebuild confirmed it (0 errors).
