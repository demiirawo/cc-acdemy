## Why this needs another pass

Database snapshot from right now:

- 2 most recent attempts → both `status: in_progress`, `total_score 0`, `max_score 0`, `cv_path NULL`
- `recruitment_answers`, `recruitment_events`, `recruitment_snapshots` → **0 rows total, ever**

So no candidate has ever made it past question 1, no event has ever been logged, no snapshot has ever been saved, and no CV has been linked to an attempt. The earlier RLS migration unblocked the policies, but several independent bugs in `CandidateApplyPage.tsx` and the result screens still prevent anything from being captured or shown. This plan fixes them all and adds real diagnostics so silent failures stop happening.

## Scope (only what you flagged)

- Webcam preview + periodic snapshots
- Anti‑cheat detection + integrity score
- Admin tooling: Results Dashboard + Result Detail (CV preview, snapshot gallery, scores)

I will **not** touch the Test Builder UI, the rich text editor, or any unrelated area. Scoring logic stays as-is (correct answer = full weight, wrong = 0); only the persistence path is fixed.

---

## 1. Candidate page — webcam + snapshots

Problem: the `<video>` element only mounts inside the `stage === "test"` branch, but `requestAccess()` tries to attach the stream **while still on the `permissions` stage**, so `videoRef.current` is `null`, the stream never renders, and `takeSnapshot` later sees `videoWidth === 0` and bails out forever.

Fix:
- Render the `<video>` element once at the top of the component (visually shown only during the test stage), so the ref exists before we request the camera.
- After `getUserMedia` resolves, attach the stream and `await` `loadedmetadata` before moving to `stage: "test"`. Toast + abort if the user denies access.
- In `takeSnapshot`, wait for `videoWidth > 0` with a short retry loop instead of giving up immediately. Use a fixed 320×240 canvas to avoid huge JPEGs.
- Run the first snapshot from a `loadedmetadata` callback, not a 3 s timeout, then continue every 15 s.
- Surface upload/insert errors as a one‑time toast + `console.error` (not `console.warn`) so failures are visible.

## 2. Candidate page — anti‑cheat + integrity

Problem: penalties are computed but never written back to the attempt row, so the dashboard always shows integrity 100 even when events fire. Also `mouseout` on `documentElement` fires constantly while moving between child elements, producing false positives that get throttled away — net result feels like “nothing is detected”.

Fix:
- Replace the `documentElement.mouseout` listener with `document.addEventListener("mouseleave", …)` on `document` (fires only when the cursor actually leaves the viewport). Keep the 2.5 s throttle.
- After each `logEvent`, also `update recruitment_attempts.integrity_score` so the live value persists (debounced to 1/s). Today integrity is only written in `finalize()`, which never runs for abandoned attempts.
- Always log a `started` event the moment the attempt is created so the dashboard can show “began but never finished”.
- Log a `submitted` event in `finalize()`.

## 3. Candidate page — score + finalise

Problem: `handleAdvance` is referenced by the `setInterval` timer via stale closure (`qIndex`/`selected` captured at effect mount), so the auto‑advance on timeout inserts the wrong question’s answer. Also `finalize` is only called on the last question; if the candidate closes the tab on Q3 of 5, the attempt stays `in_progress` forever with no answers visible.

Fix:
- Move `handleAdvance` into a `useRef` updated on every render, and have the timer call `advanceRef.current()`. This kills the stale‑closure bug.
- Add a `beforeunload` / `visibilitychange(hidden + pagehide)` handler that calls a lightweight `finalize({ partial: true })` using `navigator.sendBeacon` against a tiny edge function (`recruitment-finalize`) so partial attempts get a real submitted_at + computed score even when the candidate bails.
- Edge function path is needed because the anon client cannot reliably fire-and-forget on unload.

## 4. Candidate page — CV upload

Problem: CV upload happens **after** the attempt insert; if the upload fails (large file, network, CORS) we silently skip and `cv_path` stays NULL — which is exactly what both existing rows show.

Fix:
- Upload the CV first (to a temp path keyed by a generated UUID), then insert the attempt with `cv_path` already set. If upload fails, show a destructive toast and keep the user on the form — no orphaned attempt rows.
- Display the chosen filename + size under the file input so the user knows it’s attached.

## 5. Results Dashboard

Problem: the table only shows `status` and a percentage, with no way to tell apart “submitted but failed”, “in progress”, “abandoned”, or “score still 0 because no answers”. The “Open” button next to each row is decorative — only the row click works.

Fix:
- Compute `max_score` as a fallback from the test’s questions when the row’s `max_score` is 0 (handles in‑progress rows so % isn’t a nonsense 0%).
- Replace the “—” for in‑progress with a clearer status pill: **In progress**, **Abandoned** (started >30 min ago, never submitted), **Submitted**, **Closed**.
- Make the right‑side icon button actually navigate (`onOpen(a.id)`) and stop event‑propagating from the delete dialog.
- Add a “Refresh” button + auto‑refetch every 30 s while the page is open so new submissions appear without a manual reload.

## 6. Result Detail

Problem: CV preview uses `<object data=...>` which silently fails in Chrome when the signed URL’s `Content-Disposition` is `attachment` (Supabase default) — that’s why the inline preview is blank. Snapshot gallery shows nothing because no snapshots exist yet, but once #1 is fixed it also has a layout bug where `snapUrls[s.id]` may not be ready before render.

Fix:
- For the CV: request a signed URL with `download: false` and add `?download=` removal; render in `<iframe src={cvUrl + "#toolbar=0"}>` with an explicit `Open in new tab` and `Download` button. Fall back to a “Preview unavailable, open in new tab” card if the iframe `onError` fires.
- For snapshots: load signed URLs in a `useEffect` separate from the main fetch so they stream in; show a small skeleton while loading. Click → lightbox (already there) with prev/next arrow keys.
- Add an **Events timeline** card (we already fetch `events`) listing each anti‑cheat event with timestamp + penalty so the integrity score is explainable.
- Keep the prev/next attempt navigation that’s already there; have it preserve the sort order from the dashboard.

## 7. Diagnostics

- Wrap every Supabase call in the candidate page with try/catch + `console.error` and a one‑shot toast keyed by error type, so the next time something silently fails you see it immediately.
- Add a `recruitment_events` row of type `client_error` with the error message in metadata whenever an insert/upload fails — visible in the result detail timeline.

---

## Files I expect to change

- `src/components/recruitment/CandidateApplyPage.tsx` — sections 1–4, 7
- `src/components/recruitment/ResultsDashboard.tsx` — section 5
- `src/components/recruitment/ResultDetail.tsx` — section 6
- `src/components/recruitment/types.ts` — add `client_error` to penalty map (= 0)
- New edge function `supabase/functions/recruitment-finalize/index.ts` — section 3 (partial finalise on unload)
- Supabase migration: none required — schema already supports everything.

## Out of scope (will not touch)

- Test Builder UI/UX
- Rich text editor
- Scoring algorithm (still binary correct-or-not × weight)
- Authentication / RLS (already correct after the prior migration)
- Mobile candidate experience (still blocked)

## How we’ll verify

After implementation, run a fresh attempt end‑to‑end on the public link:
1. Webcam tile appears bottom‑right during the test.
2. After ~15 s a row appears in `recruitment_snapshots`; thumbnail visible in Result Detail.
3. Switching tabs / right‑clicking decrements the live integrity score and creates a `recruitment_events` row.
4. Answering both questions correctly produces `total_score = max_score` and a `submitted` row in the dashboard.
5. CV uploaded on the form is downloadable + previewable from Result Detail.
6. Closing the tab mid‑test marks the attempt as `submitted` (partial) within a few seconds.
