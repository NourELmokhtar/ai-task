# M04 Learning Resources: Frontend Module Output

| Field | Value |
|---|---|
| Module | M04 Learning Resources, frontend layer (`/learning`) |
| Final status | **COMPLETED** |
| Attempts | 1 (build, unit tests and every e2e scenario passed on the first run) |
| Started / finished | 2026-10-10 19:10 / 19:22 (local) |
| Backend used | Snapshot `backend-snapshot-m04` on `http://localhost:5080` (dotnet run PID 17936, stopped). `backend/` was never run or modified, and port 5081 was never touched |
| Contract | `loops/orchestrator/outputs/handoffs/M04-learning-resources-handoff.md` (`READY`) |

## Requirements covered

FR-05, FR-06 · BR-08 (title required, client + server), BR-09 (milestones/notes always addressed through their card; 404 → refetch), BR-14 (removed card disappears; 404 → reload) · A-12 (status only via card PUT, user-set select), A-13 (toggle = full milestone PUT; `completedAt` from the server), A-14 (milestone title required ≤ 200, note text required ≤ 4000, client + server) · US-L1..L5 · AC-L1..L3 · UX-LEARN · NFR-U1, NFR-U2 (shared empty/loading/error states, responsive grid), NFR-M1 (feature folder, API service separate from presentation).

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | `LearningApi` (list/get/create/update/delete, `setStatus`, addMilestone/updateMilestone/**`setMilestoneDone`**/deleteMilestone, addNote/deleteNote) and DTO types/helpers in `learning.models.ts` | Done |
| F2 | `LearningPage`: header **Add Learning Card**, summary (`N cards · X in progress · Y completed`), responsive grid (`auto-fill, minmax(min(100%, 20rem), 1fr)`, one column on phones) | Done |
| F3 | `LearningCard` (collapsed): title, description/source (a description that is a single http(s) URL renders as a link), status badge (Not started / In progress / Completed, coloured top border), progress bar + `done/total milestones done` or "No milestones yet", status select, Show/Hide details, Remove (confirm "Remove learning card?") | Done |
| F4 | Expanded card loads `GET /{id}`. `LearningMilestones`: checkbox, title (struck through when done), target date (red when past and not done), remove; inline add form (title + optional date). `LearningNotes`: text (newlines kept), local timestamp (`<time datetime>`), remove; inline add form | Done |
| F5 | `LearningCardFormDialog` (Reactive Forms): title required/not blank/≤ 200 after trim, description ≤ 2000; server 400 `errors` applied with `applyServerErrors`, unmatched ones and non-400 errors shown as a form-level error (+ toast) | Done |
| F6 | Empty state "No learning cards yet" with **Add Learning Card**; inline hints for a card without milestones / notes; page loading + error state (Try again); per-card details loading + error state (Try again); toasts for every mutation | Done |
| F7 | Reusable exports via `features/learning/index.ts` (below) | Done |

**Data flow**
- Status change: card emits `statusChange` → page calls `LearningApi.setStatus(card, status)` = `PUT /{id}` with the card's current `title` and `description` plus the new `status` → replaces the card with the response. The select is optimistic while busy and reverts on failure.
- Milestone toggle: `setMilestoneDone(m, isDone)` = `PUT /{id}/milestones/{mid}` with the current `title` and `targetDate` and the new `isDone`. On failure the checkbox reverts.
- After any milestone/note add/toggle/remove the child emits `changed` → the card refetches `GET /{id}` → emits `changed(detail)` → the page replaces the summary, so `done/total` is always the server's count. Removed items are hidden immediately, before the refetch.
- 404s: a child 404 triggers the refetch. A 404 on the card refetch shows a toast and the page reloads the list. Page-level 404s (status/remove) reload the list too.
- Create appends the new card at the end (the list is oldest first). Remove drops it after the 204.

## Important files

```
frontend/src/app/features/learning/
  index.ts                                   public exports (F7)
  learning.models.ts                         DTOs, statuses/labels, limits, toLearningCardUpdateRequest,
                                             toMilestoneUpdateRequest, toLearningCardSummary,
                                             formatMilestoneProgress, milestonePercent, isHttpUrl
  learning-api.service.ts                    LearningApi
  learning-form.ts                           card / milestone / note forms + request builders
  learning-page.ts                           route page (replaces the placeholder; learning.routes.ts unchanged)
  components/learning-card.ts                collapsed + expanded card
  components/learning-milestones.ts          milestone list + inline add form
  components/learning-notes.ts               note list + inline add form (also exports noteExcerpt)
  components/learning-card-form-dialog.ts    Add Learning Card dialog
  testing/learning-fixtures.ts               makeCard / makeDetail / makeMilestone / makeNote for specs
  learning-api.service.spec.ts, learning-form.spec.ts, learning-page.spec.ts,
  components/learning-card-form-dialog.spec.ts
frontend/e2e/m04-learning-resources.spec.ts
```

No shared or other-feature files were changed. Reused: `ApiClient`, `ApiError`/`toApiError`, `applyServerErrors`, `FieldErrors`, `requiredTrimmed`/`maxTrimmedLength`/`optionalDateOnly`, `Dialog`, `ConfirmDialog`, `EmptyState`, `LoadingState`, `ErrorState`, `ToastService`, `formatDate`/`formatDateTime`/`todayLocal`.

## API integrations

| Endpoint | Used for | Verified (e2e against the snapshot) |
|---|---|---|
| `GET /api/learning-cards` (no `status`) | page list | yes (200, no status param) |
| `GET /api/learning-cards/{id}` | expand + refetch after child changes | yes |
| `POST /api/learning-cards` | Add Learning Card | yes (201) |
| `PUT /api/learning-cards/{id}` | status change (title + description + status) | yes (body asserted; description kept in the DB) |
| `DELETE /api/learning-cards/{id}` | Remove after confirm | yes (then GET → 404) |
| `POST /{id}/milestones` | inline add | yes (with and without target date) |
| `PUT /{id}/milestones/{mid}` | complete checkbox | yes (body `{title, targetDate, isDone}` asserted; `completedAt` set) |
| `DELETE /{id}/milestones/{mid}` | remove milestone | yes |
| `POST /{id}/notes` | inline add | yes (trimmed text) |
| `DELETE /{id}/notes/{nid}` | remove note | yes |

## Verification (all executed and observed)

| Check | Command | Result |
|---|---|---|
| Production build | `npm run build` | PASS, no warnings (initial 313 kB / 89.5 kB transfer, unchanged; `learning-routes` lazy chunk 28.7 kB / 6.9 kB) |
| Unit tests | `npm run test:ci` | PASS, **168/168** (115 existing + 53 new) |
| E2E M04 | `npx playwright test e2e/m04-learning-resources.spec.ts` | PASS, **8/8** (scenarios 1–7 + 1 extra) |
| E2E regression | `npx playwright test` (all specs) | PASS, 35 passed, 1 skipped by design (M01 9/9, M02 9/9, M03 9/9, M04 8/8) |
| Visual check | screenshots at 1280 px and 375 px (expanded card with milestones and a note, URL description, Completed card) | layout OK, no horizontal overflow, no console errors |

Playwright scenarios:
1. Real load: `GET /api/learning-cards` 200 with no `status` param, no console errors. With a stubbed empty list: "No learning cards yet" with **Add Learning Card**, which opens the dialog: PASS
2. Empty and whitespace-only titles show "Title is required." and the dialog stays open. A valid title + description → POST 201, toast, the card appears with the description, "Not started" badge, "No milestones yet", select = NotStarted. The API matches, and the card is still there after a reload: PASS
3. Expand → both inline hints shown. An empty milestone title shows "Title is required.". Add milestone 1 (target date) → `0/1`, form cleared. Add milestone 2 (no date) → counter `0/2`, two rows, target date only on the first. The API has 2 milestones, `[title, targetDate]` as entered: PASS
4. Check milestone 1 → PUT body exactly `{title, targetDate, isDone: true}`, counter `1/2`, checked, toast. The API has `isDone`, `completedAt` set, the target date kept, `milestonesDone=1`. Reload → `1/2`. Remove milestone 2 → gone, toast, `1/1`. The API has only milestone 1: PASS
5. An empty note shows "Text is required.". Adding a note (padded with spaces) shows the trimmed text. The `<time datetime>` equals the API `createdAt`, and the displayed text equals the browser's local `Intl` medium date + short time. Remove → gone, hint back, toast, API notes `[]`: PASS
6. Select In progress → PUT body exactly `{title, description, status: 'InProgress'}`, badge "In progress", toast. Then Completed → badge "Completed". The API has status Completed with the description kept. Still Completed after a reload: PASS
7. Remove → the confirm dialog shows the title. Cancel keeps the card. Remove → gone, toast, API 404, still gone after a reload: PASS
- Extra (F6): list 500 → "Couldn't load learning cards" + the detail → **Try again** recovers: PASS

Unit coverage (53 new):
- `LearningApi`: every method's URL, method and body; list omits an empty `status`; **`setStatus` keeps title + description** (null description sent explicitly); **`setMilestoneDone` keeps title + targetDate** (both directions, null date); 404 → `ApiError` detail.
- Forms: card title required/blank/200/201, description 2000/2001, trimmed request with null description; milestone title required/blank/200/201, target date optional/valid/invalid, null date; note text required/blank/4000/4001, inner newlines kept.
- Helpers: update-request builders, `toLearningCardSummary`, progress/percent, `isHttpUrl` (rejects `javascript:` and mixed text), `noteExcerpt`.
- `LearningCardFormDialog`: empty/blank submit sends nothing; 201-char title message; trimmed POST, toast, emit, close; reset on reopen; server field errors + form error; 500 detail.
- `LearningPage` (with the real card, milestones and notes components): loading → empty CTA opens the dialog; badges/progress/URL link/summary; error + retry; status PUT body and badge; failed status reverts the select; remove with confirm; inline hints; add milestone (validation, POST, refetch → `0/1`, form reset); toggle (PUT body, refetch → `1/2`); failed toggle reverts; remove milestone; add note (validation, trimmed POST, `<time>`); note 4001 limit; remove note; detail 404 → list reload.

Test data: e2e cards use the unique prefix `E2E-M04-<run>` and are deleted in `afterAll`. Screenshot cards (`SHOT-M04`) were deleted by the script. Afterwards none were left. The only remaining card, "M07V card", belongs to another agent and was left alone. Both processes I started (snapshot API PID 17936, ng serve PID 4040) were stopped, and ports 5080 and 4200 are free.

## Reusable exports (for M06 / M08)

Import from `src/app/features/learning` (the `index.ts` barrel). Everything is standalone or `providedIn: 'root'`.

| Export | Kind | Use |
|---|---|---|
| `LearningApi` | service | `list(query?)` (`{ status? }`; omitted/empty → all cards, oldest first), `get(id)` (detail with milestones + notes), `create({title, description})`, `update(id, {title, description, status})` (full replacement), **`setStatus(card, status)`** (keeps title/description), `delete(id)` (soft), `addMilestone(cardId, {title, targetDate})`, `updateMilestone(cardId, mid, {title, targetDate, isDone})`, **`setMilestoneDone(milestone, isDone)`** (keeps title/targetDate), `deleteMilestone`, `addNote(cardId, {text})`, `deleteNote`. **M06 item picker:** `learningApi.list()`. The API has no search, so filter client-side by `title`. Deleted cards are absent from the list and give 404 |
| `LearningCardSummary`, `LearningCardDetail`, `LearningMilestone`, `LearningNote`, `LearningCardStatus`, request types, `LearningCardListQuery` | types | Shared DTOs |
| `LEARNING_CARD_STATUSES`, `LEARNING_CARD_STATUS_LABELS`, `LEARNING_TITLE_MAX`, `LEARNING_DESCRIPTION_MAX`, `MILESTONE_TITLE_MAX`, `NOTE_TEXT_MAX`, `formatMilestoneProgress`, `milestonePercent`, `toLearningCardSummary`, `toLearningCardUpdateRequest`, `toMilestoneUpdateRequest`, `isHttpUrl` | constants/helpers | Labels (`Not started`/`In progress`/`Completed`), limits, `"1/2"` progress text |
| `LearningCardFormDialog` (`app-learning-card-form-dialog`) | component | **M08 quick-add.** Inputs: `[(open)]` (model, boolean). Outputs: `saved(LearningCardDetail)`. It resets on open, validates (title required ≤ 200, description ≤ 2000), POSTs through `LearningApi`, toasts "Learning card created", emits `saved` and closes. Server errors are shown in the dialog. Usage: `<app-learning-card-form-dialog [(open)]="addOpen" (saved)="reload()" />` |
| `LearningCard` (`app-learning-card`) | component | Full card (optional for M08). Inputs: `card` (required `LearningCardSummary`), `busy` (default false; disables the select/remove and keeps the optimistic select value). Outputs: `statusChange(LearningCardStatus)` (the parent calls `setStatus`), `remove()` (the parent confirms + deletes), `changed(LearningCardDetail)` (fresh detail after expand/child changes; replace the summary), `missing()` (404 on the detail; reload). It manages its own milestones and notes through `LearningApi` |
| `createLearningCardForm`, `createMilestoneForm`, `createNoteForm`, `toLearningCardFormRequest`, `toMilestoneFormRequest`, `toNoteFormRequest`, `LearningCardForm`, `MilestoneForm`, `NoteForm` | form helpers | Same client validation as M04 |

Test ids: `learning-card` (with `data-card-id`, `data-card-status`), `learning-status` (with `data-status`), `milestone-progress` (with `data-done`, `data-total`), `learning-card-details`, `milestone` (with `data-milestone-id`), `milestone-target`, `milestones-empty`, `note` (with `data-note-id`), `note-time`, `notes-empty`, `learning-summary`. Accessible names: status select `Status of <title>`, details toggle `Show details for <title>` / `Hide details for <title>`, card remove `Remove <title>`, milestone checkbox `Mark <milestone> as done`, `Remove milestone <milestone>`, `Remove note <excerpt>`, forms `Add milestone` / `Add note`.

## Assumptions and deviations

- **Playwright test runner** (per task.md), not Playwright MCP. The spec is `frontend/e2e/m04-learning-resources.spec.ts`.
- **Scenario 1 "fresh DB"**: the DB is shared, so the empty state is checked with `page.route` stubbing an empty `GET /api/learning-cards`. The real load is checked in the same test.
- **No card edit dialog** (title/description edit is not in F1–F7). `LearningApi.update` exists for later use. The dialog is create-only, matching "Create takes only title + description".
- **Milestone and note removal have no confirmation** (only the card removal does, per F3). They show a toast. This is a hard delete without undo, as in the handoff.
- **No status filter** on the page (not in F1–F7). `list({ status })` supports it.
- A description that is exactly one http(s) URL renders as a link (`target=_blank`, `rel=noopener noreferrer`). Other text is shown as plain text with newlines kept.
- Overdue milestone target dates (past and not done) are shown in red. This is display only.
- Notes are shown oldest first (API order). Expanded state is per card and kept across list reloads (`track c.id`). Re-expanding refetches the detail.
- No HTML `maxlength` on the inputs, so the limit messages can appear (same as Tasks/Habits). The Add dialog doesn't close on a backdrop click.

## Notes for later modules

- Import from `features/learning` (the barrel), not deep paths. `LearningPage` isn't exported.
- Always use `setStatus` / `setMilestoneDone` (or the `to…UpdateRequest` builders) for PUTs. A partial body clears `description` / `targetDate`.
- Milestone/note responses don't include card counts. Refetch `get(id)` (or `list()`) to show `milestonesDone/milestonesTotal`.
- M06: `learningApi.list()` is the item source (deleted cards are not listed, so a stale plan item gives 404 on `get`). Marking a learning plan item done must not change the card.
- M08: `list()` gives per-status counts (count by `status`). There is no "milestones completed in the last 7 days" endpoint on the API side, so that snapshot needs the backend (handoff §5) or per-card `get` calls. Quick-add: `LearningCardFormDialog`.
