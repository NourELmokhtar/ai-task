#!/usr/bin/env bash
# QuickFlow API regression (M09 B2/B3/B4).
#
# Usage:   backend/scripts/regression.sh [BASE_URL] [TIMING_ROUNDS]
#          BASE_URL       default http://localhost:5081 (or $QF_BASE_URL)
#          TIMING_ROUNDS  default 10 (or $QF_TIMING_ROUNDS); 0 skips the NFR-P1 timing section
# Example: backend/scripts/regression.sh http://localhost:5081 10
#
# Requires: bash, curl, node (Node 24, used only to read JSON). No credentials are used or needed:
# the script talks to the running API over HTTP only.
#
# Safe on a shared database: every record it creates has a unique prefix (REG<epoch>), every
# aggregate check is a delta measured right before/after the action, and everything it creates is
# soft-deleted at the end (also on Ctrl+C / failure). Settings are restored to their original values.
# Exit code: 0 when all checks pass, 1 otherwise.

set -u -o pipefail

# Git Bash on Windows: never rewrite arguments that look like POSIX paths (JS regexes, API paths).
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

BASE="${1:-${QF_BASE_URL:-http://localhost:5081}}"
BASE="${BASE%/}"
ROUNDS="${2:-${QF_TIMING_ROUNDS:-10}}"
P="REG$(date +%s)"
PERF_LIMIT_MS=500

TMP="$(mktemp -d)"
if command -v cygpath >/dev/null 2>&1; then TMP="$(cygpath -m "$TMP")"; fi
RESP="$TMP/resp.json"
HDR="$TMP/headers.txt"
TIMES="$TMP/times.tsv"
: > "$TIMES"

PASS=0
FAIL=0
FAILED=()
CODE=""
MS=""

# ---------------------------------------------------------------- helpers

# call LABEL METHOD PATH [JSON_BODY] -> sets CODE and MS, body in $RESP, headers in $HDR
call() {
  local label="$1" method="$2" path="$3" body="${4-}"
  local args=(-s -o "$RESP" -D "$HDR" -w '%{http_code} %{time_total}' -X "$method" "$BASE$path")
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' --data-binary "$body"); fi
  local out
  out="$(curl "${args[@]}")" || out="000 0"
  CODE="${out%% *}"
  MS="$(awk -v t="${out##* }" 'BEGIN { printf "%.1f", t * 1000 }')"
  printf '%s\t%s\n' "$label" "$MS" >> "$TIMES"
}

# j 'JS expression over d (parsed last response body)' -> prints the value (objects as JSON)
j() {
  node -e '
    const fs = require("fs");
    let d = null; try { d = JSON.parse(fs.readFileSync(0, "utf8")); } catch (e) {}
    let v; try { v = eval(process.argv[1]); } catch (e) { v = "<err:" + e.message + ">"; }
    process.stdout.write(v === undefined ? "undefined" : (v !== null && typeof v === "object") ? JSON.stringify(v) : String(v));
  ' -- "$1" < "$RESP"
}

ok()   { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); FAILED+=("$1"); printf '  FAIL  %s  (%s)\n' "$1" "$2"; }

# expect_code LABEL EXPECTED
expect_code() {
  if [ "$CODE" = "$2" ]; then ok "$1 -> $CODE"; else bad "$1" "expected HTTP $2, got $CODE: $(head -c 300 "$RESP")"; fi
}
# expect_eq LABEL EXPECTED ACTUAL
expect_eq() {
  if [ "$2" = "$3" ]; then ok "$1 = $3"; else bad "$1" "expected '$2', got '$3'"; fi
}
# expect_true LABEL 'JS boolean expression over d'
expect_true() {
  local v; v="$(j "$2")"
  if [ "$v" = "true" ]; then ok "$1"; else bad "$1" "expression false: $2"; fi
}

section() { printf '\n== %s\n' "$1"; }

iso_in_minutes() { node -e 'process.stdout.write(new Date(Date.now() + Number(process.argv[1]) * 60000).toISOString().replace(/\.\d+Z$/, "Z"))' -- "$1"; }
date_add_days() { node -e 'const d = new Date(process.argv[1] + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(process.argv[2])); process.stdout.write(d.toISOString().slice(0, 10))' -- "$1" "$2"; }

# Cleanup registry (soft delete everything this run created).
CLEAN_PLANS=(); CLEAN_TASKS=(); CLEAN_HABITS=(); CLEAN_CARDS=()
SETTINGS_ORIGINAL=""
cleanup() {
  local id
  for id in "${CLEAN_PLANS[@]+"${CLEAN_PLANS[@]}"}";   do curl -s -o "$TMP/discard" -X DELETE "$BASE/api/plans/$id"; done
  for id in "${CLEAN_TASKS[@]+"${CLEAN_TASKS[@]}"}";   do curl -s -o "$TMP/discard" -X DELETE "$BASE/api/tasks/$id"; done
  for id in "${CLEAN_HABITS[@]+"${CLEAN_HABITS[@]}"}"; do curl -s -o "$TMP/discard" -X DELETE "$BASE/api/habits/$id"; done
  for id in "${CLEAN_CARDS[@]+"${CLEAN_CARDS[@]}"}";   do curl -s -o "$TMP/discard" -X DELETE "$BASE/api/learning-cards/$id"; done
  if [ -n "$SETTINGS_ORIGINAL" ]; then
    curl -s -o "$TMP/discard" -X PUT -H 'Content-Type: application/json' --data-binary "$SETTINGS_ORIGINAL" "$BASE/api/settings"
  fi
  CLEAN_PLANS=(); CLEAN_TASKS=(); CLEAN_HABITS=(); CLEAN_CARDS=(); SETTINGS_ORIGINAL=""
}
trap 'cleanup; rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM

NOT_FOUND_ID=2147483000

echo "QuickFlow regression against $BASE (prefix $P)"

# ---------------------------------------------------------------- M01 foundation
section "M01 Foundation"
call health GET /api/health
expect_code "GET /api/health" 200
expect_eq "health.status" Healthy "$(j 'd.status')"
expect_true "health.serverTime is UTC ISO" '/Z$/.test(d.serverTime)'
call unknown GET /api/does-not-exist
expect_code "GET unknown route" 404
expect_true "unknown route is ProblemDetails" 'd.status === 404 && typeof d.title === "string"'
if grep -qi '^content-type: application/problem+json' "$HDR"; then ok "unknown route content-type problem+json"; else bad "unknown route content-type" "$(grep -i '^content-type' "$HDR")"; fi
curl -s -o "$TMP/discard" -D "$HDR" -X OPTIONS -H 'Origin: http://localhost:4200' -H 'Access-Control-Request-Method: PATCH' "$BASE/api/plans/1/items/1"
if grep -qi '^access-control-allow-origin: http://localhost:4200' "$HDR"; then ok "CORS preflight from http://localhost:4200"; else bad "CORS preflight" "no allow-origin header"; fi

# Server-local "today" (same default every endpoint uses)
call dashboard GET /api/dashboard
TODAY="$(j 'd.today')"
YESTERDAY="$(date_add_days "$TODAY" -1)"
TOMORROW="$(date_add_days "$TODAY" 1)"
echo "  (server today = $TODAY)"

# ---------------------------------------------------------------- M02 tasks
section "M02 Tasks"
call tasks.create POST /api/tasks "{\"title\":\"  $P task A  \",\"priority\":\"High\",\"dueDate\":\"$TOMORROW\"}"
expect_code "POST /api/tasks" 201
TASK_A="$(j 'd.id')"; CLEAN_TASKS+=("$TASK_A")
expect_eq "task title trimmed" "$P task A" "$(j 'd.title')"
expect_eq "task default status" Todo "$(j 'd.status')"
if grep -qi "^location: .*/api/tasks/$TASK_A" "$HDR"; then ok "task Location header"; else bad "task Location header" "$(grep -i '^location' "$HDR")"; fi
call tasks.create POST /api/tasks '{"title":"   "}'
expect_code "POST /api/tasks blank title (validation)" 400
expect_eq "errors.title" "Title is required." "$(j 'd.errors.title[0]')"
call tasks.create POST /api/tasks "{\"title\":\"$P x\",\"priority\":\"Urgent\"}"
expect_code "POST /api/tasks invalid priority" 400
call tasks.get GET "/api/tasks/$TASK_A"
expect_code "GET /api/tasks/{id}" 200
call tasks.get GET "/api/tasks/$NOT_FOUND_ID"
expect_code "GET /api/tasks/{missing} (404)" 404
expect_eq "404 detail" "Task with id '$NOT_FOUND_ID' was not found." "$(j 'd.detail')"
call tasks.update PUT "/api/tasks/$TASK_A" "{\"title\":\"$P task A2\",\"status\":\"InProgress\",\"priority\":\"High\",\"dueDate\":\"$TOMORROW\"}"
expect_code "PUT /api/tasks/{id}" 200
expect_eq "task status after PUT" InProgress "$(j 'd.status')"
call tasks.update PUT "/api/tasks/$TASK_A" "{\"title\":\"$P x\"}"
expect_code "PUT /api/tasks/{id} without status/priority" 400
expect_true "PUT errors status+priority" 'd.errors.status[0] === "Status is required." && d.errors.priority[0] === "Priority is required."'
call tasks.update PUT "/api/tasks/$NOT_FOUND_ID" '{"title":"x","status":"Todo","priority":"Low"}'
expect_code "PUT /api/tasks/{missing}" 404
call tasks.create POST /api/tasks "{\"title\":\"$P task overdue\",\"dueDate\":\"$YESTERDAY\"}"
TASK_O="$(j 'd.id')"; CLEAN_TASKS+=("$TASK_O")
expect_eq "overdue task isOverdue" true "$(j 'd.isOverdue')"
call tasks.filter GET "/api/tasks?search=$P&overdue=true"
expect_code "GET /api/tasks?overdue=true" 200
expect_true "overdue filter returns only the overdue task" "d.length === 1 && d[0].id === $TASK_O"
call tasks.filter GET "/api/tasks?search=$P&priority=High&sortBy=dueDate&sortDir=asc"
expect_true "priority filter returns task A only" "d.length === 1 && d[0].id === $TASK_A"
call tasks.filter GET "/api/tasks?search=$P&dueFrom=$TOMORROW&dueTo=$TOMORROW"
expect_true "dueFrom/dueTo filter" "d.length === 1 && d[0].id === $TASK_A"
call tasks.filter GET "/api/tasks?sortBy=title"
expect_code "GET /api/tasks?sortBy=title (invalid)" 400
call tasks.filter GET "/api/tasks?today=10-10-2026"
expect_code "GET /api/tasks?today=10-10-2026 (invalid)" 400
call tasks.complete POST "/api/tasks/$TASK_O/complete"
expect_code "POST /api/tasks/{id}/complete" 200
expect_true "completed: Done + completedAt + not overdue" 'd.status === "Done" && d.completedAt !== null && d.isOverdue === false'
call tasks.complete POST "/api/tasks/$NOT_FOUND_ID/complete"
expect_code "POST /api/tasks/{missing}/complete" 404
call tasks.archive POST "/api/tasks/$TASK_O/archive"
expect_code "POST /api/tasks/{id}/archive" 200
expect_eq "isArchived" true "$(j 'd.isArchived')"
call tasks.filter GET "/api/tasks?search=$P"
expect_true "archived task hidden from default list" "!d.some(t => t.id === $TASK_O)"
call tasks.filter GET "/api/tasks?search=$P&archived=true"
expect_true "archived=true lists only archived" "d.length === 1 && d[0].id === $TASK_O"
call tasks.restore POST "/api/tasks/$TASK_O/restore"
expect_code "POST /api/tasks/{id}/restore" 200
expect_eq "restored isArchived" false "$(j 'd.isArchived')"
call tasks.archive POST "/api/tasks/$NOT_FOUND_ID/archive"
expect_code "POST /api/tasks/{missing}/archive" 404
call tasks.delete DELETE "/api/tasks/$TASK_O"
expect_code "DELETE /api/tasks/{id}" 204
call tasks.get GET "/api/tasks/$TASK_O"
expect_code "GET deleted task" 404
call tasks.delete DELETE "/api/tasks/$TASK_O"
expect_code "DELETE deleted task" 404

# ---------------------------------------------------------------- M03 habits
section "M03 Habits"
call habits.create POST /api/habits "{\"name\":\"$P habit\",\"description\":\"d\",\"frequency\":\"Daily\"}"
expect_code "POST /api/habits" 201
HABIT="$(j 'd.id')"; CLEAN_HABITS+=("$HABIT")
expect_true "new habit active, not completed, streak 0" 'd.isActive === true && d.completedToday === false && d.currentStreak === 0'
call habits.create POST /api/habits "{\"name\":\"$P h\",\"frequency\":\"Monthly\"}"
expect_code "POST /api/habits invalid frequency" 400
expect_eq "errors.frequency" "Frequency must be one of: Daily, Weekly." "$(j 'd.errors.frequency[0]')"
call habits.get GET "/api/habits/$HABIT"
expect_code "GET /api/habits/{id}" 200
call habits.get GET "/api/habits/$NOT_FOUND_ID"
expect_code "GET /api/habits/{missing}" 404
call habits.update PUT "/api/habits/$HABIT" "{\"name\":\"$P habit 2\",\"frequency\":\"Daily\"}"
expect_code "PUT /api/habits/{id}" 200
expect_true "PUT cleared description" 'd.description === null && d.name.endsWith("habit 2")'
call habits.complete POST "/api/habits/$HABIT/completions" "{\"date\":\"$YESTERDAY\"}"
expect_code "POST completion (yesterday)" 201
call habits.complete POST "/api/habits/$HABIT/completions" "{\"date\":\"$YESTERDAY\"}"
expect_code "POST duplicate completion (409)" 409
call habits.complete POST "/api/habits/$HABIT/completions" "{\"date\":\"$TOMORROW\"}"
expect_code "POST future completion" 400
expect_eq "errors.date" "Completion date cannot be in the future." "$(j 'd.errors.date[0]')"
call habits.list GET "/api/habits/$HABIT/completions?from=$YESTERDAY&to=$TODAY"
expect_code "GET /api/habits/{id}/completions" 200
expect_true "completions list has yesterday" "d.length === 1 && d[0].date === \"$YESTERDAY\""
call habits.list GET "/api/habits/$HABIT/completions?from=$TODAY&to=$YESTERDAY"
expect_code "GET completions to<from" 400
call habits.uncomplete DELETE "/api/habits/$HABIT/completions/$YESTERDAY"
expect_code "DELETE /api/habits/{id}/completions/{date}" 204
call habits.uncomplete DELETE "/api/habits/$HABIT/completions/$YESTERDAY"
expect_code "DELETE missing completion" 404
call habits.deactivate POST "/api/habits/$HABIT/deactivate"
expect_code "POST /api/habits/{id}/deactivate" 200
expect_eq "isActive after deactivate" false "$(j 'd.isActive')"
call habits.complete POST "/api/habits/$HABIT/completions"
expect_code "complete inactive habit" 400
call habits.list GET "/api/habits?active=true"
expect_true "inactive habit not in active=true" "!d.some(h => h.id === $HABIT)"
call habits.list GET "/api/habits?active=false"
expect_true "inactive habit in active=false" "d.some(h => h.id === $HABIT)"
call habits.activate POST "/api/habits/$HABIT/activate"
expect_code "POST /api/habits/{id}/activate" 200
call habits.activate POST "/api/habits/$NOT_FOUND_ID/activate"
expect_code "POST /api/habits/{missing}/activate" 404
call habits.create POST /api/habits "{\"name\":\"$P habit del\",\"frequency\":\"Weekly\"}"
HABIT_DEL="$(j 'd.id')"; CLEAN_HABITS+=("$HABIT_DEL")
call habits.delete DELETE "/api/habits/$HABIT_DEL"
expect_code "DELETE /api/habits/{id}" 204
call habits.get GET "/api/habits/$HABIT_DEL"
expect_code "GET deleted habit" 404
call habits.list GET "/api/habits?active=abc"
expect_code "GET /api/habits?active=abc" 400

# ---------------------------------------------------------------- M04 learning
section "M04 Learning cards"
call learning.create POST /api/learning-cards "{\"title\":\"$P card\",\"description\":\"Book\"}"
expect_code "POST /api/learning-cards" 201
CARD="$(j 'd.id')"; CLEAN_CARDS+=("$CARD")
expect_true "new card NotStarted, 0/0" 'd.status === "NotStarted" && d.milestonesTotal === 0 && d.milestones.length === 0 && d.notes.length === 0'
call learning.create POST /api/learning-cards '{"description":"no title"}'
expect_code "POST card without title" 400
expect_eq "errors.title" "Title is required." "$(j 'd.errors.title[0]')"
call learning.get GET "/api/learning-cards/$NOT_FOUND_ID"
expect_code "GET /api/learning-cards/{missing}" 404
call learning.update PUT "/api/learning-cards/$CARD" "{\"title\":\"$P card\",\"description\":\"Book\",\"status\":\"InProgress\"}"
expect_code "PUT /api/learning-cards/{id}" 200
expect_eq "card status" InProgress "$(j 'd.status')"
call learning.update PUT "/api/learning-cards/$CARD" "{\"title\":\"$P card\",\"status\":\"Paused\"}"
expect_code "PUT card invalid status" 400
call learning.milestone POST "/api/learning-cards/$CARD/milestones" "{\"title\":\"$P m1\",\"targetDate\":\"$TOMORROW\"}"
expect_code "POST /api/learning-cards/{id}/milestones" 201
MS1="$(j 'd.id')"
expect_true "milestone not done" 'd.isDone === false && d.completedAt === null'
call learning.milestone POST "/api/learning-cards/$CARD/milestones" "{\"title\":\"$P m2\"}"
MS2="$(j 'd.id')"
call learning.milestone POST "/api/learning-cards/$CARD/milestones" '{"title":""}'
expect_code "POST milestone blank title" 400
call learning.milestone PUT "/api/learning-cards/$CARD/milestones/$MS2" "{\"title\":\"$P m2\"}"
expect_code "PUT milestone without isDone" 400
expect_eq "errors.isDone" "IsDone is required." "$(j 'd.errors.isDone[0]')"
call learning.milestone PUT "/api/learning-cards/$CARD/milestones/$NOT_FOUND_ID" "{\"title\":\"x\",\"isDone\":true}"
expect_code "PUT missing milestone" 404
call learning.note POST "/api/learning-cards/$CARD/notes" '{"text":"  first note\nline 2  "}'
expect_code "POST /api/learning-cards/{id}/notes" 201
NOTE="$(j 'd.id')"
expect_true "note text trimmed, inner newline kept" 'd.text === "first note\nline 2"'
call learning.note POST "/api/learning-cards/$CARD/notes" '{"text":"   "}'
expect_code "POST note blank text" 400
call learning.get GET "/api/learning-cards/$CARD"
expect_code "GET /api/learning-cards/{id}" 200
expect_true "detail has 2 milestones and 1 note" 'd.milestonesTotal === 2 && d.milestonesDone === 0 && d.notes.length === 1'
call learning.note DELETE "/api/learning-cards/$CARD/notes/$NOTE"
expect_code "DELETE /api/learning-cards/{id}/notes/{noteId}" 204
call learning.note DELETE "/api/learning-cards/$CARD/notes/$NOTE"
expect_code "DELETE deleted note" 404
call learning.milestone DELETE "/api/learning-cards/$CARD/milestones/$MS2"
expect_code "DELETE /api/learning-cards/{id}/milestones/{milestoneId}" 204
call learning.list GET "/api/learning-cards?status=InProgress"
expect_code "GET /api/learning-cards?status=InProgress" 200
expect_true "status filter contains card" "d.some(c => c.id === $CARD && c.milestonesTotal === 1)"
call learning.list GET "/api/learning-cards?status=Bogus"
expect_code "GET /api/learning-cards?status=Bogus" 400
call learning.create POST /api/learning-cards "{\"title\":\"$P card del\"}"
CARD_DEL="$(j 'd.id')"; CLEAN_CARDS+=("$CARD_DEL")
call learning.delete DELETE "/api/learning-cards/$CARD_DEL"
expect_code "DELETE /api/learning-cards/{id}" 204
call learning.get GET "/api/learning-cards/$CARD_DEL"
expect_code "GET deleted card" 404
call learning.note POST "/api/learning-cards/$CARD_DEL/notes" '{"text":"x"}'
expect_code "POST note on deleted card" 404

# ---------------------------------------------------------------- M05 settings
section "M05 Settings"
call settings.get GET /api/settings
expect_code "GET /api/settings" 200
SETTINGS_ORIGINAL="$(j 'JSON.stringify({displayName: d.displayName, planStartNotificationsEnabled: d.planStartNotificationsEnabled, defaultView: d.defaultView})')"
# Compare instants, not strings: a freshly created row is returned with 7 fractional digits, DB reads with 6 (M05 handoff §2).
ORIG_UPDATED="$(j 'Date.parse(d.updatedAt)')"
call settings.put PUT /api/settings "$SETTINGS_ORIGINAL"
expect_code "PUT /api/settings (same values)" 200
expect_eq "identical PUT keeps updatedAt (ms)" "$ORIG_UPDATED" "$(j 'Date.parse(d.updatedAt)')"
call settings.put PUT /api/settings "{\"displayName\":\"  $P  \",\"planStartNotificationsEnabled\":false,\"defaultView\":\"Tasks\"}"
expect_code "PUT /api/settings (changed)" 200
expect_true "settings saved and trimmed" "d.displayName === \"$P\" && d.planStartNotificationsEnabled === false && d.defaultView === \"Tasks\""
call settings.put PUT /api/settings '{"displayName":"x","planStartNotificationsEnabled":true,"defaultView":"Unknown"}'
expect_code "PUT /api/settings invalid defaultView" 400
call settings.get GET /api/settings
expect_eq "rejected PUT changed nothing" "Tasks" "$(j 'd.defaultView')"
call settings.put PUT /api/settings "$SETTINGS_ORIGINAL"
expect_code "PUT /api/settings (restore original)" 200
SETTINGS_ORIGINAL=""
echo "  (settings is a singleton: no 404 case)"

# ---------------------------------------------------------------- M06/M07 plans
section "M06/M07 Plans"
call tasks.create POST /api/tasks "{\"title\":\"$P plan task\"}"
PTASK="$(j 'd.id')"; CLEAN_TASKS+=("$PTASK")
START="$(iso_in_minutes -10)"; END="$(iso_in_minutes 60)"
PLAN_BODY="{\"title\":\"$P plan\",\"estimatedDurationMinutes\":70,\"startDateTime\":\"$START\",\"endDateTime\":\"$END\",\"priorityOrder\":1,\"items\":[{\"sourceType\":\"Task\",\"sourceId\":$PTASK},{\"sourceType\":\"Habit\",\"sourceId\":$HABIT},{\"sourceType\":\"LearningResource\",\"sourceId\":$CARD}]}"
call plans.create POST /api/plans "$PLAN_BODY"
expect_code "POST /api/plans" 201
PLAN="$(j 'd.id')"; CLEAN_PLANS+=("$PLAN")
expect_true "new plan InProgress, 0/3, rest ~3600 s" 'd.status === "InProgress" && d.totalItems === 3 && d.progressPercent === 0 && d.restTimeSeconds > 3500 && d.restTimeSeconds <= 3600 && /Z$/.test(d.serverNow)'
expect_true "items resolve source titles" "d.items[0].sourceTitle === \"$P plan task\" && d.items.every(i => i.sourceAvailable && !i.isDone)"
ITEM_TASK="$(j 'd.items[0].id')"; ITEM_HABIT="$(j 'd.items[1].id')"; ITEM_CARD="$(j 'd.items[2].id')"
call plans.create POST /api/plans "{\"title\":\"$P p\",\"estimatedDurationMinutes\":10,\"startDateTime\":\"$START\",\"endDateTime\":\"$END\",\"priorityOrder\":1,\"items\":[]}"
expect_code "POST plan with no items" 400
expect_eq "errors.items" "At least one item is required." "$(j 'd.errors.items[0]')"
call plans.create POST /api/plans "{\"title\":\"$P p\",\"estimatedDurationMinutes\":10,\"startDateTime\":\"$END\",\"endDateTime\":\"$START\",\"priorityOrder\":1,\"items\":[{\"sourceType\":\"Task\",\"sourceId\":$NOT_FOUND_ID}]}"
expect_code "POST plan end<start + missing source" 400
expect_true "errors endDateTime + items[0].sourceId" 'd.errors.endDateTime[0] === "End date/time must be after the start date/time." && d.errors["items[0].sourceId"][0].startsWith("Task with id")'
call plans.get GET "/api/plans/$PLAN"
expect_code "GET /api/plans/{id}" 200
call plans.get GET "/api/plans/$NOT_FOUND_ID"
expect_code "GET /api/plans/{missing}" 404
call plans.update PUT "/api/plans/$PLAN" "{\"title\":\"$P plan v2\",\"estimatedDurationMinutes\":70,\"startDateTime\":\"$START\",\"endDateTime\":\"$END\",\"priorityOrder\":2}"
expect_code "PUT /api/plans/{id}" 200
expect_true "PUT kept items, updated metadata" 'd.title.endsWith("plan v2") && d.priorityOrder === 2 && d.totalItems === 3'
call plans.update PUT "/api/plans/$PLAN" "{\"title\":\"$P plan v2\",\"estimatedDurationMinutes\":0,\"startDateTime\":\"$START\",\"endDateTime\":\"$END\",\"priorityOrder\":2}"
expect_code "PUT plan duration 0" 400
call plans.filter GET "/api/plans?group=active"
expect_code "GET /api/plans?group=active" 200
expect_true "plan in group=active" "d.some(p => p.id === $PLAN)"
call plans.filter GET "/api/plans?group=history"
expect_code "GET /api/plans?group=history (invalid)" 400
call plans.patch PATCH "/api/plans/$PLAN/items/$ITEM_TASK" '{}'
expect_code "PATCH item without isDone" 400
call plans.patch PATCH "/api/plans/$PLAN/items/$NOT_FOUND_ID" '{"isDone":true}'
expect_code "PATCH missing item" 404

# Upcoming plan (NotStarted, rest null)
call plans.create POST /api/plans "{\"title\":\"$P upcoming\",\"estimatedDurationMinutes\":30,\"startDateTime\":\"$(iso_in_minutes 1440)\",\"endDateTime\":\"$(iso_in_minutes 1470)\",\"priorityOrder\":1,\"items\":[{\"sourceType\":\"Habit\",\"sourceId\":$HABIT}]}"
PLAN_UP="$(j 'd.id')"; CLEAN_PLANS+=("$PLAN_UP")
expect_true "future plan NotStarted, rest null" 'd.status === "NotStarted" && d.restTimeSeconds === null'
call plans.filter GET "/api/plans?group=upcoming"
expect_true "future plan in group=upcoming" "d.some(p => p.id === $PLAN_UP) && !d.some(p => p.id === $PLAN)"

# ---------------------------------------------------------------- cross-module flows + M08
section "Cross-module flows (BR-13, dashboard)"
call dashboard GET /api/dashboard
D0_DONE="$(j 'd.tasks.doneCount')"; D0_CTODAY="$(j 'd.tasks.completedTodayCount')"
expect_true "dashboard lists the running plan at 0%" "d.plans.active.some(p => p.id === $PLAN && p.progressPercent === 0 && p.doneItems === 0)"

call plans.patch PATCH "/api/plans/$PLAN/items/$ITEM_TASK" '{"isDone":true}'
expect_code "PATCH task item isDone=true" 200
expect_true "plan progress 1/3 = 33%" 'd.doneItems === 1 && d.progressPercent === 33 && d.status === "InProgress"'
call tasks.get GET "/api/tasks/$PTASK"
expect_true "BR-13: plan task item done -> task Done with completedAt" 'd.status === "Done" && d.completedAt !== null'
call dashboard GET /api/dashboard
expect_true "dashboard plans.active progressPercent = 33 for the plan" "d.plans.active.some(p => p.id === $PLAN && p.progressPercent === 33 && p.doneItems === 1)"
expect_eq "dashboard tasks.doneCount delta" 1 "$(( $(j 'd.tasks.doneCount') - D0_DONE ))"
expect_eq "dashboard tasks.completedTodayCount delta" 1 "$(( $(j 'd.tasks.completedTodayCount') - D0_CTODAY ))"

call plans.patch PATCH "/api/plans/$PLAN/items/$ITEM_TASK" '{"isDone":false}'
expect_true "un-marking item: plan back to 0%" 'd.doneItems === 0 && d.progressPercent === 0'
call tasks.get GET "/api/tasks/$PTASK"
expect_eq "BR-13: un-marking item keeps the task Done" Done "$(j 'd.status')"

# Habit completion -> dashboard
call dashboard GET /api/dashboard
D1_HAB="$(j 'd.habits.completedTodayCount')"
expect_true "dashboard habit item not completed yet" "d.habits.items.some(h => h.id === $HABIT && h.completedToday === false)"
call habits.complete POST "/api/habits/$HABIT/completions"
expect_code "POST completion (today, no body)" 201
call dashboard GET /api/dashboard
expect_eq "dashboard habits.completedTodayCount delta" 1 "$(( $(j 'd.habits.completedTodayCount') - D1_HAB ))"
expect_true "dashboard habit item completedToday, streak 1" "d.habits.items.some(h => h.id === $HABIT && h.completedToday === true && h.currentStreak === 1)"
call plans.get GET "/api/plans/$PLAN"
expect_eq "habit completion does not change the plan item (no reverse sync)" false "$(j "d.items.find(i => i.id === $ITEM_HABIT).isDone")"

# Milestone done -> dashboard
call dashboard GET /api/dashboard
D2_MDONE="$(j 'd.learning.milestonesDone')"; D2_M7="$(j 'd.learning.milestonesCompletedLast7Days')"; D2_MTOT="$(j 'd.learning.milestonesTotal')"
call learning.milestone PUT "/api/learning-cards/$CARD/milestones/$MS1" "{\"title\":\"$P m1\",\"targetDate\":\"$TOMORROW\",\"isDone\":true}"
expect_code "PUT /api/learning-cards/{id}/milestones/{milestoneId} isDone=true" 200
expect_true "milestone done with completedAt" 'd.isDone === true && d.completedAt !== null'
call dashboard GET /api/dashboard
expect_eq "dashboard learning.milestonesDone delta" 1 "$(( $(j 'd.learning.milestonesDone') - D2_MDONE ))"
expect_eq "dashboard learning.milestonesCompletedLast7Days delta" 1 "$(( $(j 'd.learning.milestonesCompletedLast7Days') - D2_M7 ))"
expect_eq "dashboard learning.milestonesTotal delta" 0 "$(( $(j 'd.learning.milestonesTotal') - D2_MTOT ))"

# All items done -> Completed + history + dashboard
call dashboard GET /api/dashboard
D3_INPROG="$(j 'd.plans.inProgressCount')"; D3_COMPL="$(j 'd.plans.completedCount')"
for item in "$ITEM_TASK" "$ITEM_HABIT" "$ITEM_CARD"; do
  call plans.patch PATCH "/api/plans/$PLAN/items/$item" '{"isDone":true}'
done
expect_true "all items done -> Completed, 100%, rest null" 'd.status === "Completed" && d.progressPercent === 100 && d.restTimeSeconds === null'
call plans.filter GET "/api/plans?group=completed"
expect_true "completed plan in group=completed" "d.some(p => p.id === $PLAN)"
call dashboard GET /api/dashboard
expect_eq "dashboard plans.inProgressCount delta" -1 "$(( $(j 'd.plans.inProgressCount') - D3_INPROG ))"
expect_eq "dashboard plans.completedCount delta" 1 "$(( $(j 'd.plans.completedCount') - D3_COMPL ))"
expect_true "completed plan left dashboard plans.active" "!d.plans.active.some(p => p.id === $PLAN)"

# Source deleted later -> item kept with sourceAvailable=false (A-24)
call tasks.delete DELETE "/api/tasks/$PTASK"
call plans.get GET "/api/plans/$PLAN"
expect_true "A-24: deleted source keeps title, sourceAvailable=false" "(() => { const i = d.items.find(x => x.id === $ITEM_TASK); return i.sourceAvailable === false && i.sourceTitle === \"$P plan task\" && d.totalItems === 3; })()"

call dashboard GET "/api/dashboard?today=2026-13-01"
expect_code "GET /api/dashboard?today=2026-13-01 (invalid)" 400
echo "  (dashboard is a single read model: no 404 case)"

call plans.delete DELETE "/api/plans/$PLAN_UP"
expect_code "DELETE /api/plans/{id}" 204
call plans.get GET "/api/plans/$PLAN_UP"
expect_code "GET deleted plan" 404
call plans.patch PATCH "/api/plans/$PLAN_UP/items/1" '{"isDone":true}'
expect_code "PATCH on deleted plan" 404

# ---------------------------------------------------------------- B3 OpenAPI completeness
section "OpenAPI completeness (/openapi/v1.json)"
call openapi GET /openapi/v1.json
expect_code "GET /openapi/v1.json" 200
OPENAPI_REPORT="$(node -e '
  const fs = require("fs");
  const d = JSON.parse(fs.readFileSync(0, "utf8"));
  const expected = [
    "GET /api/health",
    "GET /api/tasks", "POST /api/tasks", "GET /api/tasks/{id}", "PUT /api/tasks/{id}", "DELETE /api/tasks/{id}",
    "POST /api/tasks/{id}/complete", "POST /api/tasks/{id}/archive", "POST /api/tasks/{id}/restore",
    "GET /api/habits", "POST /api/habits", "GET /api/habits/{id}", "PUT /api/habits/{id}", "DELETE /api/habits/{id}",
    "POST /api/habits/{id}/deactivate", "POST /api/habits/{id}/activate", "POST /api/habits/{id}/completions",
    "GET /api/habits/{id}/completions", "DELETE /api/habits/{id}/completions/{date}",
    "GET /api/learning-cards", "POST /api/learning-cards", "GET /api/learning-cards/{id}", "PUT /api/learning-cards/{id}",
    "DELETE /api/learning-cards/{id}", "POST /api/learning-cards/{id}/milestones",
    "PUT /api/learning-cards/{id}/milestones/{milestoneId}", "DELETE /api/learning-cards/{id}/milestones/{milestoneId}",
    "POST /api/learning-cards/{id}/notes", "DELETE /api/learning-cards/{id}/notes/{noteId}",
    "GET /api/settings", "PUT /api/settings",
    "GET /api/plans", "POST /api/plans", "GET /api/plans/{id}", "PUT /api/plans/{id}", "DELETE /api/plans/{id}",
    "PATCH /api/plans/{id}/items/{itemId}",
    "GET /api/dashboard"
  ];
  const queryParams = {
    "GET /api/tasks": ["search","status","priority","dueFrom","dueTo","overdue","archived","sortBy","sortDir","today"],
    "GET /api/habits": ["active","today"], "GET /api/habits/{id}/completions": ["from","to"],
    "GET /api/learning-cards": ["status"], "GET /api/plans": ["group"], "GET /api/dashboard": ["today"]
  };
  const schemaFields = {
    TaskResponse: ["isOverdue","completedAt","isArchived"], HabitResponse: ["completedToday","completedForCurrentPeriod","currentStreak","lastCompletionDate"],
    LearningCardDetail: ["milestonesTotal","milestonesDone","milestones","notes"], SettingsResponse: ["displayName","planStartNotificationsEnabled","defaultView","updatedAt"],
    PlanResponse: ["status","restTimeSeconds","serverNow","progressPercent","items"], PlanItemResponse: ["sourceTitle","sourceAvailable","isDone"],
    DashboardResponse: ["serverNow","today","tasks","habits","plans","learning"], DashboardLearning: ["milestonesCompletedLast7Days"]
  };
  const ops = {};
  for (const [p, item] of Object.entries(d.paths || {}))
    for (const [m, op] of Object.entries(item)) ops[m.toUpperCase() + " " + p] = op;
  const out = [];
  const missing = expected.filter(e => !ops[e]);
  const extra = Object.keys(ops).filter(k => !expected.includes(k));
  out.push("documented=" + Object.keys(ops).length + " expected=" + expected.length);
  for (const m of missing) out.push("MISSING op " + m);
  for (const x of extra) out.push("UNDOCUMENTED-IN-HANDOFF op " + x);
  for (const [op, names] of Object.entries(queryParams)) {
    const have = ((ops[op] || {}).parameters || []).filter(p => p.in === "query").map(p => p.name);
    for (const n of names) if (!have.includes(n)) out.push("MISSING query " + op + " ?" + n);
  }
  const schemas = (d.components || {}).schemas || {};
  for (const [s, fields] of Object.entries(schemaFields)) {
    const props = Object.keys((schemas[s] || {}).properties || {});
    for (const f of fields) if (!props.includes(f)) out.push("MISSING field " + s + "." + f);
  }
  console.log(out.join("\n"));
' < "$RESP")"
echo "$OPENAPI_REPORT" | sed 's/^/  /'
if echo "$OPENAPI_REPORT" | grep -q '^MISSING'; then bad "OpenAPI completeness" "see MISSING lines"; else ok "OpenAPI lists every handoff operation, query parameter and response field checked"; fi

# Clean up functional data now (timing section registers its own).
cleanup

# ---------------------------------------------------------------- B4 NFR-P1 timings
if [ "$ROUNDS" -gt 0 ]; then
  section "NFR-P1 timings ($ROUNDS rounds, limit ${PERF_LIMIT_MS} ms)"
  : > "$TIMES"
  call perf.setup POST /api/tasks "{\"title\":\"$P perf src task\"}"; ST="$(j 'd.id')"; CLEAN_TASKS+=("$ST")
  call perf.setup POST /api/habits "{\"name\":\"$P perf src habit\",\"frequency\":\"Daily\"}"; SH="$(j 'd.id')"; CLEAN_HABITS+=("$SH")
  call perf.setup POST /api/learning-cards "{\"title\":\"$P perf src card\"}"; SC="$(j 'd.id')"; CLEAN_CARDS+=("$SC")
  call perf.setup GET /api/settings
  SETTINGS_SAME="$(j 'JSON.stringify({displayName: d.displayName, planStartNotificationsEnabled: d.planStartNotificationsEnabled, defaultView: d.defaultView})')"
  for i in $(seq 1 "$ROUNDS"); do
    call tasks.create POST /api/tasks "{\"title\":\"$P perf task $i\",\"priority\":\"High\",\"dueDate\":\"$TODAY\"}"; T="$(j 'd.id')"; CLEAN_TASKS+=("$T")
    call tasks.update PUT "/api/tasks/$T" "{\"title\":\"$P perf task $i\",\"status\":\"InProgress\",\"priority\":\"Low\",\"dueDate\":\"$TODAY\"}"
    call tasks.filter GET "/api/tasks?search=$P&priority=Low&sortBy=dueDate"
    call tasks.complete POST "/api/tasks/$T/complete"
    call tasks.delete DELETE "/api/tasks/$T"

    call habits.create POST /api/habits "{\"name\":\"$P perf habit $i\",\"frequency\":\"Weekly\"}"; H="$(j 'd.id')"; CLEAN_HABITS+=("$H")
    call habits.update PUT "/api/habits/$H" "{\"name\":\"$P perf habit $i\",\"frequency\":\"Daily\"}"
    call habits.complete POST "/api/habits/$H/completions"
    call habits.filter GET "/api/habits?active=true"
    call habits.delete DELETE "/api/habits/$H"

    call learning.create POST /api/learning-cards "{\"title\":\"$P perf card $i\"}"; C="$(j 'd.id')"; CLEAN_CARDS+=("$C")
    call learning.addMilestone POST "/api/learning-cards/$C/milestones" "{\"title\":\"m\"}"; M="$(j 'd.id')"
    call learning.updateMilestone PUT "/api/learning-cards/$C/milestones/$M" '{"title":"m","isDone":true}'
    call learning.filter GET "/api/learning-cards?status=NotStarted"
    call learning.delete DELETE "/api/learning-cards/$C"

    call plans.create POST /api/plans "{\"title\":\"$P perf plan $i\",\"estimatedDurationMinutes\":60,\"startDateTime\":\"$(iso_in_minutes -5)\",\"endDateTime\":\"$(iso_in_minutes 55)\",\"priorityOrder\":1,\"items\":[{\"sourceType\":\"Task\",\"sourceId\":$ST},{\"sourceType\":\"Habit\",\"sourceId\":$SH},{\"sourceType\":\"LearningResource\",\"sourceId\":$SC}]}"
    PL="$(j 'd.id')"; PI="$(j 'd.items[1].id')"; CLEAN_PLANS+=("$PL")
    call plans.patchItem PATCH "/api/plans/$PL/items/$PI" '{"isDone":true}'
    call plans.filter GET "/api/plans?group=active"
    call plans.delete DELETE "/api/plans/$PL"

    call settings.update PUT /api/settings "$SETTINGS_SAME"
    call dashboard.get GET /api/dashboard
  done
  PERF_REPORT="$(node -e '
    const fs = require("fs"); const limit = Number(process.argv[1]);
    const rows = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").map(l => l.split("\t")).filter(r => r[0] !== "perf.setup");
    const by = {}; for (const [k, v] of rows) (by[k] ||= []).push(Number(v));
    const lines = []; let worst = 0;
    for (const [k, v] of Object.entries(by)) {
      v.sort((a, b) => a - b); const n = v.length;
      const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; const max = v[n - 1]; worst = Math.max(worst, max);
      lines.push(k.padEnd(26) + " n=" + String(n).padStart(3) + "  median=" + med.toFixed(1).padStart(7) + " ms  max=" + max.toFixed(1).padStart(7) + " ms" + (max >= limit ? "  OVER LIMIT" : ""));
    }
    const all = rows.map(r => Number(r[1])).sort((a, b) => a - b);
    lines.push("ALL".padEnd(26) + " n=" + String(all.length).padStart(3) + "  median=" + all[Math.floor(all.length / 2)].toFixed(1).padStart(7) + " ms  max=" + worst.toFixed(1).padStart(7) + " ms");
    console.log(lines.join("\n"));
  ' -- "$PERF_LIMIT_MS" "$TIMES")"
  echo "$PERF_REPORT" | sed 's/^/  /'
  if echo "$PERF_REPORT" | grep -q 'OVER LIMIT'; then bad "NFR-P1 every call < ${PERF_LIMIT_MS} ms" "see OVER LIMIT lines"; else ok "NFR-P1 every timed call < ${PERF_LIMIT_MS} ms"; fi
  cleanup
fi

# ---------------------------------------------------------------- summary
printf '\n== Summary: %d passed, %d failed (prefix %s, all created data soft-deleted)\n' "$PASS" "$FAIL" "$P"
if [ "$FAIL" -gt 0 ]; then
  printf '  failed: %s\n' "${FAILED[@]}"
  exit 1
fi
exit 0
