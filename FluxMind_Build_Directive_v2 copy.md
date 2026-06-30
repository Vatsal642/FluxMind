# MASTER DIRECTIVE: PROJECT FLUXMIND (AUTONOMOUS BUILD)

## 1. SYSTEM ROLE & OBJECTIVE
You are an Elite Full-Stack Systems Architect and DevOps Engineer operating inside Google Antigravity.
Your mission is to build, test, and deploy **FluxMind** — an AI-powered, proactive productivity execution engine for a hackathon.

FluxMind is not a passive to-do list. It is an active execution companion: it plans tasks, schedules them, explains its reasoning, tracks habits/goals, and takes small real actions (like drafting emails) on the user's behalf, with approval.

**Build instruction:** Work phase by phase (Section 9). At the end of each phase, output the actual code/config files for that phase — not pseudocode, not a summary — and pause for a "Proceed" confirmation before continuing.

**No-guesswork rule:** Every endpoint, event, data shape, and decision rule needed to build this is specified below. If you believe something is genuinely still ambiguous after reading the whole document, stop and ask — do not invent a contract that isn't written here.

---

## 2. REPOSITORY ARCHITECTURE & TECH STACK
Monorepo with three top-level folders: `/frontend`, `/backend`, `/database`.

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, Zustand (state), Framer Motion (animations), native WebSocket client (via `socket.io-client`).
- **Backend:** Node.js, Express, TypeScript, Socket.io, Gemini API (`@google/generative-ai`), Google Workspace MCP integration, `google-auth-library` for OAuth.
- **Scheduling Engine:** in-process TypeScript module inside the backend (`/backend/src/scheduler/`) — not a separate service. Pure-function design so it could be extracted later without touching the rest of the app.
- **Database:** PostgreSQL 15+, accessed via `pg` with parameterized queries (no ORM required, but Prisma is acceptable if it speeds up the build — schema in Section 3 must match exactly either way).
- **Deployment:** Docker, Google Cloud Run (two services: `fluxmind-frontend`, `fluxmind-backend`), Cloud SQL for Postgres.

**CORS configuration (exact, required because frontend and backend are separate Cloud Run services with different origins):**
- Backend Express app uses the `cors` middleware with `origin` set to the exact frontend Cloud Run URL (read from a `FRONTEND_URL` env var — do not hardcode it, since the URL is only known after first deploy), and `credentials: true` (required for the httpOnly session cookie from Section 4.1 to work cross-origin).
- Socket.io server is configured with the same `cors: { origin: process.env.FRONTEND_URL, credentials: true }`.
- The frontend's API calls and Socket.io client both use an env var `NEXT_PUBLIC_BACKEND_URL` pointing at the backend Cloud Run URL.
- Because both URLs are only known after the first `gcloud run deploy`, Phase 4 must deploy the backend first, capture its URL, deploy the frontend with that URL baked in as `NEXT_PUBLIC_BACKEND_URL`, capture the frontend's URL, then update the backend's `FRONTEND_URL` env var and redeploy the backend once more. Document this two-pass deploy order explicitly in the Phase 4 output — do not let the builder discover this CORS chicken-and-egg problem mid-deploy.

---

## 3. DATABASE SCHEMA (POSTGRESQL)
Create `/database/init.sql` with this exact schema:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE task_status AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'MISSED');
CREATE TYPE energy_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE block_type AS ENUM ('FIXED_EVENT', 'FLUID_TASK', 'HABIT');
CREATE TYPE agentic_action_type AS ENUM ('EMAIL_DRAFT', 'NONE');
CREATE TYPE agentic_status AS ENUM ('NOT_APPLICABLE', 'DRAFTED', 'SENT', 'REJECTED');

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    google_refresh_token TEXT,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    estimated_minutes INT NOT NULL DEFAULT 15,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    energy_required energy_level NOT NULL DEFAULT 'MEDIUM',
    is_agentic BOOLEAN NOT NULL DEFAULT FALSE,
    agentic_action_type agentic_action_type NOT NULL DEFAULT 'NONE',
    agentic_status agentic_status NOT NULL DEFAULT 'NOT_APPLICABLE',
    agentic_draft_content TEXT,
    status task_status NOT NULL DEFAULT 'PENDING',
    parent_task_id UUID REFERENCES tasks(task_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE task_dependencies (
    dependency_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    UNIQUE (task_id, depends_on_task_id)
);

CREATE TABLE calendar_blocks (
    block_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reference_id UUID NOT NULL,
    type_of_block block_type NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE
);
-- reference_id is intentionally POLYMORPHIC and has NO foreign key constraint.
-- Do NOT add a REFERENCES clause to it — it must work for both tasks and habits_and_goals.
-- To resolve it: if type_of_block IN ('FIXED_EVENT', 'FLUID_TASK'), reference_id joins to tasks.task_id.
-- If type_of_block = 'HABIT', reference_id joins to habits_and_goals.habit_id.
-- Application code (not the DB) is responsible for joining to the correct table based on type_of_block.

CREATE TABLE habits_and_goals (
    habit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    anchor_event VARCHAR(100),
    target_metric INT NOT NULL,
    current_progress INT NOT NULL DEFAULT 0,
    target_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mission_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    action_taken VARCHAR(255) NOT NULL,
    reasoning TEXT NOT NULL,
    related_task_id UUID REFERENCES tasks(task_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Mission log trigger rule (exact, no interpretation needed):** a row is inserted into `mission_logs` on every one of these events, and ONLY these:
1. Scheduler runs after a new Brain Dump and places ≥1 task → one log row per moved/placed task.
2. Scheduler reshuffles existing `FLUID_TASK` blocks because a new `FIXED_EVENT` was added → one log row per block moved.
3. A habit's `current_progress` falls behind pace (see Section 7.3) and the system proposes a plan change → one log row.
4. An agentic draft is created → one log row (`action_taken = "Drafted email for: {task title}"`).
`action_taken` is a short human-readable label (max 255 chars). `reasoning` is 1-3 plain-English sentences explaining the "why," written by the same Gemini call that performed the action (pass the scheduler's diff into Gemini and ask it to phrase the reasoning — do not hardcode template strings, but do constrain Gemini's output to 1-3 sentences via the prompt).

---

## 4. API CONTRACT (REST) — EXACT ENDPOINTS, NO SUBSTITUTES

All endpoints are prefixed `/api`. All authenticated endpoints require an `Authorization: Bearer <session_token>` header. Request/response bodies are JSON.

### 4.1 `POST /api/auth/google`
Initiates Google OAuth (Calendar + Gmail scopes: `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/gmail.compose`). Standard OAuth redirect flow; on callback, upsert into `users`, store `google_refresh_token`, and return a session token.

**Session token mechanism (exact):** the `session_token` is a JWT, signed with the `SESSION_SECRET` env var (HS256), containing `{ user_id, email, iat, exp }`. Expiry is 7 days (`exp` = `iat + 7d`) — long-lived on purpose since this is a hackathon demo, not a production security posture. The frontend stores it in memory (Zustand) plus a same-site `httpOnly` cookie set by the backend on the OAuth callback redirect, so a page refresh doesn't require re-login. There is no refresh-token-rotation flow for the session JWT itself in this build — when it expires, the frontend simply redirects to `/api/auth/google` again to re-auth. The separate `google_refresh_token` (Google's own OAuth refresh token, stored server-side) is what's used to silently get new Google API access tokens for Gmail/Calendar calls — that one does NOT expire on the same 7-day cycle and is refreshed automatically server-side per Google's standard OAuth2 flow.

**WebSocket re-auth:** the Socket.io client passes the same JWT in `auth: { token }` on connection (Section 5). If the JWT is expired at connection time, the server rejects the connection with an `unauthorized` error event; the frontend catches this and redirects to re-auth the same way as an expired REST call (see below). The socket does NOT need to re-auth mid-session if it was valid at connect time — Socket.io's built-in reconnection logic will simply reuse the same (still-cached) token on any disconnect/reconnect within the 7-day window.

**Expired-token behavior on REST calls:** any authenticated endpoint returns `401 { "error": "session_expired" }` if the JWT is invalid/expired. Frontend global fetch wrapper catches every 401 response and redirects to `/api/auth/google`, regardless of which endpoint triggered it.

**Response 200:**
```json
{ "session_token": "string", "user_id": "uuid", "email": "string" }
```

### 4.2 `POST /api/brain-dump`
Submits raw text (from typing or transcribed voice) for extraction.
**Request:**
```json
{ "raw_text": "Submit thesis review by Friday, call mom tomorrow at 5pm" }
```
**Behavior:** Backend calls Gemini with the system prompt in Section 7.1 and the strict JSON schema below. On success, each extracted task is inserted into `tasks` (and `task_dependencies` if applicable), then the scheduler (Section 6) runs synchronously and the result is emitted via WebSocket event `schedule:update` — the HTTP response returns immediately with the raw extraction; the frontend does NOT wait on this HTTP call for the schedule, it waits on the WebSocket event.
**Response 200:**
```json
{
  "extracted_tasks": [
    {
      "temp_id": "string (client-side correlation id, e.g. 'extract-0')",
      "title": "string",
      "estimated_minutes": 30,
      "deadline": "2026-07-03T17:00:00Z",
      "energy_required": "MEDIUM",
      "is_agentic": false,
      "agentic_action_type": "NONE",
      "depends_on_temp_ids": []
    }
  ]
}
```
**Response 422 (Gemini extraction failed/empty):**
```json
{ "error": "extraction_failed", "message": "Could not extract any tasks from that input. Try rephrasing with a clearer deadline." }
```
Frontend behavior on 422: show the message inline under the Brain Dump Console input, do not clear the user's typed text.

### 4.3 `GET /api/schedule?week_start=2026-06-22`
Returns all `calendar_blocks` for the given week.
**Response 200:**
```json
{
  "week_start": "2026-06-22",
  "blocks": [
    {
      "block_id": "uuid",
      "reference_id": "uuid (task_id or habit_id)",
      "type_of_block": "FLUID_TASK",
      "start_time": "2026-06-22T09:00:00Z",
      "end_time": "2026-06-22T09:15:00Z",
      "is_locked": false,
      "task_title": "string (joined from tasks table for display)"
    }
  ]
}
```

### 4.4 `GET /api/tasks?status=PENDING`
Lists tasks, optionally filtered by status. Returns full task rows as defined in the schema, camelCase-mapped.

**`MISSED` status rule (exact, no interpretation needed):** a lightweight interval job (`setInterval` in the backend process, every 5 minutes — no separate cron infra needed for a hackathon build) runs this logic: for every task where `deadline < NOW()` AND `status NOT IN ('COMPLETED', 'MISSED')`, set `status = 'MISSED'` and write one `mission_logs` row per task: `action_taken: "Missed deadline: {task title}"`, `reasoning: "This task's deadline passed before it was marked complete."` (this reasoning string is hardcoded, NOT a Gemini call — it's a deterministic fact, no AI judgment needed). Emit `mission_log:new` for each. The frontend's Fluid Timeline does not need special rendering for `MISSED` blocks beyond this: once a task is `MISSED`, its `calendar_blocks` row (if any) is left in place but the popover (8.2) shows a red "Missed" label instead of the "Start Focus" button.

---

### 4.5 `POST /api/tasks/:taskId/start`
Marks a task as the active focus task. Triggers Micro-Focus HUD state on frontend. (HUD "in progress" state is tracked client-side via Zustand, not as a new DB status — the schema's `task_status` enum stays PENDING/SCHEDULED/COMPLETED/MISSED only.)
**Response 200:** `{ "task_id": "uuid", "title": "string", "estimated_minutes": 15 }`

### 4.6 `POST /api/tasks/:taskId/complete`
Sets `status = 'COMPLETED'`. If this task has a `parent_task_id`, check if all sibling sub-tasks are also completed; if so, mark the parent completed too (cascade check, one level only — the schema only supports one level of parent/child via `parent_task_id`, so no deep recursion is needed).
**Response 200:** `{ "task_id": "uuid", "status": "COMPLETED" }`

### 4.7 `GET /api/tasks/:taskId/draft`
Returns the current agentic draft for a task.
**Response 200:**
```json
{ "task_id": "uuid", "agentic_action_type": "EMAIL_DRAFT", "agentic_status": "DRAFTED", "draft_content": "string (full email body, plain text)", "draft_subject": "string" }
```

### 4.8 `PATCH /api/tasks/:taskId/draft`
Edits the draft content before sending.
**Request:** `{ "draft_content": "string", "draft_subject": "string" }`
**Response 200:** same shape as 4.7 with updated content, `agentic_status` unchanged.

### 4.9 `POST /api/tasks/:taskId/draft/approve`
Sends the email via Gmail API using the stored (possibly edited) draft. Sets `agentic_status = 'SENT'`. This is the ONLY endpoint that triggers a real external send — it must require this explicit call, never triggered automatically by extraction or scheduling.
**Design note:** "Approve" and "Send" are a single combined action, not two steps — clicking [Approve & Send] in the UI fires this one endpoint directly. There is deliberately no intermediate `APPROVED` status that sits un-sent; the enum only has `DRAFTED → SENT` (or `DRAFTED → REJECTED`). Do not add an extra confirmation step beyond what's in Section 8.3.
**Response 200:** `{ "task_id": "uuid", "agentic_status": "SENT", "sent_at": "ISO8601 timestamp" }`
**Response 502 (Gmail API failure):** `{ "error": "send_failed", "message": "string" }` — on failure, `agentic_status` stays `DRAFTED` so the user can retry.

### 4.10 `POST /api/tasks/:taskId/draft/reject`
Discards the draft. Sets `agentic_status = 'REJECTED'`. Task itself is unaffected (still PENDING/SCHEDULED).

### 4.11 `GET /api/habits`
Lists all `habits_and_goals` rows for the user, with a computed `pace_status` field (see Section 7.3 for the exact formula): `"AHEAD" | "ON_TRACK" | "BEHIND"`.

### 4.12 `POST /api/habits`
Creates a new habit/goal.
**Request:** `{ "title": "string", "anchor_event": "string|null", "target_metric": 200, "target_deadline": "2026-07-05T23:59:59Z" }`
**Response 201:** full habit row + `pace_status`.

### 4.13 `PATCH /api/habits/:habitId/progress`
User manually logs progress (e.g., "read 20 pages today").
**Request:** `{ "increment": 20 }`
**Response 200:** `{ "habit_id": "uuid", "current_progress": 120, "target_metric": 200, "pace_status": "ON_TRACK" }`
Triggers the pace check in Section 7.3; if `pace_status` becomes `BEHIND`, write a `mission_logs` row and emit `habit:behind_pace` over WebSocket.

### 4.14 `GET /api/mission-logs?limit=50`
Returns most recent mission log rows, newest first.

---

## 5. WEBSOCKET EVENT CONTRACT — EXACT EVENT NAMES AND PAYLOADS

Connection: `socket.io` client connects with `auth: { token: session_token }`. Server joins the socket to a room named `user:{user_id}`.

### Server → Client events

**`schedule:update`**
Emitted any time the scheduler runs (after Brain Dump processing, or after a reshuffle).
```json
{
  "changed_blocks": [
    { "block_id": "uuid", "action": "CREATED|MOVED|REMOVED", "start_time": "ISO8601", "end_time": "ISO8601", "task_title": "string" }
  ]
}
```
Frontend behavior: for each entry with `action: "MOVED"`, the Fluid Timeline must look up the block's previous DOM position and animate via Framer Motion `layout` transition (shared layout animation) to its new position — never unmount/remount. For `CREATED`, fade+slide in. For `REMOVED`, fade out then remove from state.

**`mission_log:new`**
```json
{ "log_id": "uuid", "action_taken": "string", "reasoning": "string", "created_at": "ISO8601", "related_task_id": "uuid|null" }
```
Frontend prepends this to the Mission Logs drawer list and shows a small badge/dot indicator on the drawer toggle if it's collapsed.

**`habit:behind_pace`**
```json
{ "habit_id": "uuid", "title": "string", "current_progress": 120, "target_metric": 200, "suggested_action": "string (one sentence, from Gemini)" }
```
Frontend shows a dismissible toast/banner near the Habits panel.

**`draft:ready`**
```json
{ "task_id": "uuid", "agentic_action_type": "EMAIL_DRAFT", "draft_subject": "string", "draft_preview": "string (first 100 chars)" }
```
Frontend adds a new card to the Action Deck.

### Client → Server events
None required — all client actions go through the REST endpoints in Section 4, not raw socket emits. Sockets are receive-only from the frontend's perspective. This avoids ambiguity about which channel "owns" a given action.

---

## 6. SCHEDULING ENGINE — EXACT ALGORITHM

**Scope note:** The scheduler (this section) only ever creates/moves `FIXED_EVENT` and `FLUID_TASK` blocks. It never touches `HABIT` blocks.

**HABIT block creation rule (separate, simple path — not part of the scheduler):** when a habit is created via `POST /api/habits` (4.12) AND it has a non-null `anchor_event` (e.g. "after breakfast", "before bed"), create exactly one recurring `calendar_blocks` row per day between now and `target_deadline`, each with `type_of_block = 'HABIT'`, `reference_id = habit_id`, a fixed 15-minute duration, and `start_time` set to a placeholder slot adjacent to the nearest matching `FIXED_EVENT` title-text match if one exists, otherwise default to 08:00 local time. These rows are created once, synchronously, in the same request that creates the habit — no Gemini call needed, no scheduler involvement. If `anchor_event` is null, create no calendar blocks at all; the habit exists only in the Habits & Goals Panel (8.6), not on the timeline. `is_locked` is always `true` for HABIT blocks (the scheduler must never move them, since it never touches them — this flag exists for any future manual drag-and-drop feature, not used in this build).

Location: `/backend/src/scheduler/index.ts`. Pure function signature:
```ts
function computeSchedule(
  fixedEvents: FixedEvent[],
  fluidTasks: FluidTask[],
  dependencies: TaskDependency[],
  weekStart: Date,
  energyProfile: EnergyProfile
): ScheduleResult
```

**Step-by-step (implement exactly this, in this order):**
1. Represent the week as 672 slots of 15 minutes each (7 days × 24 hours × 4), indexed 0-671, anchored to `weekStart` at 00:00 in the user's `timezone`.
2. Mark slots occupied by `FIXED_EVENT` rows as unavailable (bit = 1). These never move.
3. Topologically sort `fluidTasks` using `task_dependencies` (Kahn's algorithm). If a cycle is detected, throw a typed error `CyclicDependencyError` — backend catches this, does NOT crash, responds to the triggering request with a 422 and a mission_logs entry: `action_taken: "Skipped scheduling — circular dependency detected"`.
4. Default energy profile (hardcoded constant, exported so it's overridable later): hours 06:00-11:00 = HIGH, 11:00-14:00 = MEDIUM, 14:00-17:00 = HIGH, 17:00-22:00 = MEDIUM, 22:00-06:00 = LOW.
5. For each task in topological order: find the earliest contiguous free slot run (length = `ceil(estimated_minutes / 15)`) that (a) occurs before the task's `deadline`, (b) ideally falls within a time block matching `energy_required` to the energy profile from step 4, and (c) occurs after the end time of any task it depends on. Search order: first try slots matching the task's energy level; if none exist before the deadline, fall back to any free slot before the deadline regardless of energy match, and add a mission_logs note: `"Scheduled {task} outside ideal energy window — deadline pressure"`.
6. If no free slot exists before the deadline at all, do NOT silently drop the task. Mark it in the result as `unplaceable: true` with a reason, set its DB `status` unchanged (stays PENDING, not SCHEDULED), and emit a `mission_log:new` event: `"Could not fit {task} before its deadline — your week is overbooked."` Frontend shows unplaceable tasks in a distinct "Overflow" section above the Fluid Timeline, not silently hidden.
7. Write resulting `calendar_blocks` rows (insert new / update moved / delete removed) in a single DB transaction.
8. Return the diff (created/moved/removed blocks) for the `schedule:update` WebSocket payload — do not return the full schedule on every run, only the diff, to keep the animation system correct (it needs to know what specifically moved, not just the end state).

---

## 7. AI / GEMINI INTEGRATION — EXACT PROMPTS AND SCHEMAS

### 7.1 Brain Dump Extraction
System instruction sent to Gemini (use this verbatim as the base, do not paraphrase it):
> "Extract actionable tasks from the user's input. For each task, identify: title (concise, max 100 chars), estimated_minutes (integer, default 30 if not inferable), deadline (ISO8601 — if the user says a relative date like 'tomorrow' or 'Friday', resolve it against the provided current_datetime), energy_required (LOW, MEDIUM, or HIGH — infer from task type: creative/analytical work is HIGH, routine tasks are LOW, default MEDIUM), is_agentic (true only if the task explicitly involves sending a message/email on the user's behalf, e.g. 'ask my professor for an extension' or 'email the landlord'), and depends_on (list of other task titles from this same input that must finish first, if explicitly or clearly implied). Return ONLY valid JSON matching the provided schema. Do not include any other text."

Pass `current_datetime` (server time, ISO8601, in the user's stored timezone) into the prompt every call so relative dates resolve correctly.

Use Gemini's structured output / JSON mode (`responseMimeType: "application/json"` with a `responseSchema`) — do not rely on prompt-only JSON formatting, to avoid malformed output.

`responseSchema` (pass this exact structure to the Gemini API call):
```json
{
  "type": "object",
  "properties": {
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "estimated_minutes": { "type": "integer" },
          "deadline": { "type": "string" },
          "energy_required": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH"] },
          "is_agentic": { "type": "boolean" },
          "depends_on": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["title", "estimated_minutes", "deadline", "energy_required", "is_agentic", "depends_on"]
      }
    }
  },
  "required": ["tasks"]
}
```
If the model returns an empty `tasks` array, that is the 422 case in Section 4.2 — do not retry automatically more than once.

### 7.2 Agentic Draft Generation
When a task has `is_agentic: true`, immediately after extraction, make a second Gemini call (plain text response, no JSON mode needed) with this system instruction:
> "Write a short, polite, professional email for the following task: '{task title}'. Include a subject line on the first line prefixed 'Subject: ', then a blank line, then the email body. Keep it under 150 words. Do not include placeholder brackets like [Name] — if a recipient name isn't known, address generically (e.g. 'Hello,')."
Parse the `Subject:` line out, store subject and body separately in `agentic_draft_content`/draft_subject fields, set `agentic_status = 'DRAFTED'`, emit `draft:ready`.

### 7.3 Habit Pace Calculation (exact formula, not AI-inferred)
```
expected_progress = target_metric * (time_elapsed_since_creation / total_time_until_deadline)
pace_status =
  current_progress >= expected_progress * 1.1  → "AHEAD"
  current_progress >= expected_progress * 0.9  → "ON_TRACK"
  else                                          → "BEHIND"
```
This is deterministic math, computed in the backend — NOT sent to Gemini. Only the `suggested_action` one-liner in the `habit:behind_pace` event is Gemini-generated, using this instruction:
> "A user is behind pace on this goal: '{title}', {current_progress}/{target_metric}, due {target_deadline}. In one short sentence, suggest a concrete adjustment."

---

## 8. FRONTEND COMPONENTS — EXACT BEHAVIOR PER COMPONENT

### 8.1 Brain Dump Console
- Large `<textarea>` (min-height 120px) + a microphone icon button.
- Voice input via the browser's native `SpeechRecognition` API (webkitSpeechRecognition fallback). Transcribed text appends into the same textarea live; user can edit before submitting.
- Submit button disabled while a request is in-flight; show a spinner on the button itself, not a full-page overlay. This disabled state is the sole double-submit guard required for this build — no additional debounce/idempotency-key logic is needed on the backend for 4.2.
- Side panel (visible on screens ≥768px, collapsible drawer below that): re-renders on every keystroke with a 600ms debounce, calling a lightweight client-side regex highlight pass for dates/dependency keywords (e.g. "by", "after", "before", "depends on") purely for visual feedback — this is NOT a Gemini call; the real extraction only happens on submit via 4.2. Date-like substrings get a green background span; dependency keywords get a red background span.
- On successful submit (4.2 response), clear the textarea and show a toast: "Got it — scheduling now..." Then wait for `schedule:update` to update the Fluid Timeline.

### 8.2 Fluid Timeline
- Vertical day-by-day layout, 7 columns or a scrollable single column on mobile, each showing time-of-day from 06:00–23:00 (configurable constant) in 15-min row increments matching the 672-slot model.
- `FIXED_EVENT` blocks render with a solid border and a lock icon; cannot be dragged.
- `FLUID_TASK` blocks render with a dashed border; clicking one opens a small popover with task title, deadline, and a "Start Focus" button (calls 4.5).
- `HABIT` blocks render with a dotted border and a small repeat/cycle icon (distinct from both of the above); clicking one opens a popover showing the habit title and a shortcut link that opens the Habits & Goals Panel (8.6) for that habit — it does NOT open the Micro-Focus HUD, since habits are tracked by manual progress logging, not a single-session timer.
- Use Framer Motion's `layoutId={block.block_id}` on each block so that when `schedule:update` changes a block's position in the Zustand store, Framer Motion automatically animates the transition — no manual coordinate math needed.
- "Overflow" section (Section 6 step 6) renders above the timeline as a horizontally scrolling row of red-bordered cards when non-empty; hidden entirely when empty.

### 8.3 Action Deck
- Fixed-position panel (right sidebar on desktop ≥1024px, bottom sheet on mobile), listing cards from tasks where `agentic_status IN ('DRAFTED')`.
- Each card: task title, draft subject, draft preview (first 100 chars), and two buttons.
- **[Edit Draft]** opens a modal with editable subject + body textareas, calling 4.8 `PATCH` on save.
- **[Approve & Send]** calls 4.9; on success, remove the card from the deck with a fade-out and show a toast "Sent." On 502 failure, keep the card, show an inline error message on the card itself, and add a "Retry" affordance that re-calls 4.9.
- A small "Reject" link (less prominent than the two main buttons) calls 4.10 and fades the card out.

### 8.4 Micro-Focus HUD
- Triggered client-side when user clicks "Start Focus" (calls 4.5, then sets local Zustand `activeTask` state).
- On activation: rest of the dashboard gets a CSS `filter: brightness(0.4)` + `pointer-events: none` overlay; the HUD itself renders fixed at the top center, unaffected by the dim.
- HUD shows: task title, a countdown timer counting down from `estimated_minutes * 60` seconds, and a single "Done" button.
- "Done" calls 4.6 (complete), clears `activeTask`, removes the dim overlay.
- If the countdown reaches 0 before "Done" is clicked, do not auto-complete the task — instead, change the timer display to count up (overtime) in a different color (e.g. amber/red), and keep the HUD active until the user clicks Done manually.

### 8.5 AI Mission Logs
- Collapsible drawer, default collapsed, anchored to the right edge of the screen with a toggle tab.
- Lists rows from `GET /api/mission-logs` on initial load, newest first; new `mission_log:new` events prepend live without needing a refresh.
- Each row: relative timestamp (e.g. "2m ago"), `action_taken` as a bold one-liner, `reasoning` as a smaller secondary line below it.
- Unread count badge increments while collapsed, resets to 0 on expand.

### 8.6 Habits & Goals Panel
- A dedicated panel/tab (not buried in a modal), listing all habits from `GET /api/habits`.
- Each habit renders as a progress bar (`current_progress / target_metric`), with a colored status pill: green for `AHEAD`, blue for `ON_TRACK`, amber for `BEHIND`.
- "+ New Goal" button opens a form (title, optional anchor_event text input, target_metric number input, target_deadline date picker) that calls 4.12.
- Each habit card has a "+ Log Progress" small button/input (numeric stepper or quick-add buttons like +10/+20) calling 4.13.
- On receiving `habit:behind_pace`, show a non-blocking banner at the top of this panel with the `suggested_action` text and a dismiss (X) button. Banner does not reappear for the same event once dismissed (track dismissed log_ids in Zustand, not persisted).

---

## 9. EXECUTION ROADMAP
Build sequentially. Pause after each phase for a "Proceed" confirmation.

**PHASE 1 — Scaffolding & Database**
- Terminal commands to create `/frontend`, `/backend`, `/database`.
- `docker-compose.yml` orchestrating PostgreSQL, Node/Express backend, Next.js frontend, with correct env var wiring (`DATABASE_URL`, `GEMINI_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SESSION_SECRET`, `FRONTEND_URL`, `NEXT_PUBLIC_BACKEND_URL`). For local Docker Compose, `FRONTEND_URL` and `NEXT_PUBLIC_BACKEND_URL` can point at `localhost` ports since there's no chicken-and-egg problem locally — the two-pass approach is only needed for the Cloud Run deploy in Phase 4.
- `/database/init.sql` exactly as in Section 3.
- Output complete `docker-compose.yml` and `.env.example`.

**PHASE 2 — Backend Core**
- Express server, Socket.io setup with the room-join logic from Section 5.
- All 14 REST endpoints from Section 4, exactly as specified (paths, methods, request/response shapes).
- Gemini integration per Section 7.1 and 7.2 (exact prompts and schema).
- Scheduling engine per Section 6 (exact algorithm, in order).
- Google OAuth + Gmail send integration for 4.1 and 4.9.

**PHASE 3 — Frontend**
- All six components from Section 8 (Brain Dump Console, Fluid Timeline, Action Deck, Micro-Focus HUD, Mission Logs, Habits & Goals Panel), built exactly to the behavior specs given.
- Zustand store holding: `tasks`, `calendarBlocks`, `habits`, `missionLogs`, `activeTask`, `unreadLogCount`.
- Socket.io client wired to the four server→client events in Section 5, each updating the relevant Zustand slice.

**PHASE 4 — Google Cloud Run Deployment**
- Multi-stage Dockerfiles for frontend and backend.
- Cloud SQL (Postgres) setup and connection from Cloud Run via Cloud SQL Auth Proxy or Unix socket.
- Deploy in this exact order (required by the CORS chicken-and-egg problem described in Section 2): (1) deploy `fluxmind-backend` first with a placeholder `FRONTEND_URL`, (2) capture its live URL, (3) deploy `fluxmind-frontend` with `NEXT_PUBLIC_BACKEND_URL` set to that backend URL, (4) capture the frontend's live URL, (5) update `fluxmind-backend`'s `FRONTEND_URL` env var to the real frontend URL and redeploy the backend.
- Document every required environment variable/secret via Secret Manager.

---

**ACTION REQUIRED NOW:** Acknowledge this directive, then begin PHASE 1 by outputting the terminal commands to create the folder structure, the complete `docker-compose.yml`, `.env.example`, and the complete `/database/init.sql`.
