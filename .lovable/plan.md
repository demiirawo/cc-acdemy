
Fix standard shift cover so Victory’s approved cover of Kenny’s 11 Apr 2026 07:00-10:00 shift is shown once, in the correct place, across staff/client/public/live views.

What I found
- `coverage_metadata` already exists, so this is no longer mainly a database problem.
- The biggest break is in `src/components/hr/StaffRequestsManager.tsx`: when a `shift_swap` is approved, it still rewrites `staff_schedules.user_id` from the covered person to the covering person. That makes Kenny’s original shift disappear, which is why the UI cannot reliably show “Kenny’s shift is covered by Victory”.
- `src/components/PublicClientSchedule.tsx` still does not fetch `coverage_metadata`, so it can only reason by date range and ends up treating the whole day as covered or not covered.
- Matching is inconsistent across the app:
  - some places use exact `coverage_metadata`
  - some places use broad date-range logic
  - some comparisons use `HH:mm` while stored values can be `HH:mm:ss`
- That combination explains both failure modes:
  - the wrong shift window gets marked as covered
  - sometimes no cover indicator appears at all

Behavior change included in this fix
- I will amend the current standard-cover approval behavior so approved `shift_swap` requests no longer move ownership of the underlying schedule row.
- Instead, Kenny’s base shift remains intact and the UI overlays “Covered by Victory”.
- Impact: schedule truth stays with the original shift, while cover visibility comes from the approved request. This is the correction needed to stop the disappearing/mislabelled cover behaviour.

Implementation plan
1. Align approval behavior
- Update the standard cover approval path so `shift_swap` approval never rewrites `staff_schedules.user_id`.
- Make approval behavior consistent across admin flows, especially `StaffRequestsManager.tsx` and any alternate review path.

2. Centralize exact cover matching
- Expand `src/lib/coverageUtils.ts` with one shared resolver for standard cover matching.
- The resolver will:
  - normalize times (`07:00` vs `07:00:00`)
  - prefer exact shift id matches from `coverage_metadata`
  - fall back to date + client + normalized time for pattern/legacy rows
  - preserve legacy behavior when older requests have no metadata

3. Apply that resolver everywhere cover is shown
- Update:
  - `src/components/hr/StaffScheduleManager.tsx`
  - `src/components/PublicClientSchedule.tsx`
  - `src/components/hr/LiveTimelineView.tsx`
  - `src/components/DashboardLiveView.tsx`
  - `src/components/PublicLiveView.tsx`
  - `src/components/DashboardLiveViewWrapper.tsx` if its request typing needs `coverage_metadata`
- Ensure Victory only covers Kenny’s selected 07:00-10:00 shift, not the later 17:30-22:00 shift.

4. Simplify the UI to one canonical covered-shift card
- In staff and client views, use the original shift card as the single visual element.
- Show the shift details plus a clear inline label such as “Covered by Victory”.
- Remove separate full-size duplicate cover blocks for the same shift.

5. Fix missing request data in public/client surfaces
- Update `PublicClientSchedule.tsx` request queries and types to include `coverage_metadata`.
- Mirror the same request typing in any live/public wrappers so all schedule surfaces are resolving the same source data.

Technical details
- Primary files:
  - `src/components/hr/StaffRequestsManager.tsx`
  - `src/components/hr/StaffScheduleManager.tsx`
  - `src/components/PublicClientSchedule.tsx`
  - `src/components/hr/LiveTimelineView.tsx`
  - `src/components/DashboardLiveView.tsx`
  - `src/components/PublicLiveView.tsx`
  - `src/components/DashboardLiveViewWrapper.tsx`
  - `src/lib/coverageUtils.ts`
  - possibly `src/components/hr/StaffRequestForm.tsx` for approval-path consistency
- No rich text editor changes are needed.
- No new migration appears necessary for this specific fix.

Verification
- Re-test the exact real case: Victory covering Kenny on 11 Apr 2026 from 07:00-10:00.
- Confirm all of the following:
  - staff view shows Kenny’s 07:00-10:00 shift as covered by Victory
  - client view shows one covered shift card only
  - the 17:30-22:00 shift is not marked as covered
  - public client schedule matches the same result
  - live views match the same result
  - deleting and recreating the same cover still works cleanly
