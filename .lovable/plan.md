
Plan to fix standard shift cover requests so they behave consistently across the app

What I found
- Standard shift cover data is currently too loose: `StaffRequestForm` saves a date range plus human-readable `details`, but not the exact shifts that were selected.
- Each view rebuilds cover data differently:
  - `StaffScheduleManager` staff view shows cover blocks from request ranges.
  - `StaffScheduleManager` client view generates cover entries, then filters those entries back out unless the original staff member is on holiday.
  - `PublicClientSchedule`, `LiveTimelineView`, `DashboardLiveView`, and `PublicLiveView` each have their own cover logic again.
- Create/delete invalidation is inconsistent:
  - create in `StaffRequestForm` only invalidates `my-staff-requests`
  - delete in `StaffScheduleManager` only invalidates schedule-local request keys
- The schedule still mixes “delete shift” and “remove cover”, so it is easy to remove the wrong thing and leave the base shift/request state out of sync.

Implementation plan
1. Normalize shift cover data
- Add structured metadata to `staff_requests` for `shift_swap` entries so the app stores the exact covered shifts/dates instead of relying on parsed text.
- Populate that metadata from:
  - `src/components/hr/StaffRequestForm.tsx`
  - `src/components/hr/RequestDetailPage.tsx`
- Keep backward compatibility for older rows by falling back to current date-range logic where metadata is missing.

2. Centralize cover resolution
- Create one shared helper that converts `staff_requests` + schedules/patterns/holidays into normalized “covered shift” records.
- This becomes the single source of truth for standard cover rendering and deletion.

3. Make every schedule surface use the same logic
- Update:
  - `src/components/hr/StaffScheduleManager.tsx`
  - `src/components/PublicClientSchedule.tsx`
  - `src/components/hr/LiveTimelineView.tsx`
  - `src/components/DashboardLiveView.tsx`
  - `src/components/PublicLiveView.tsx`
- Render one primary shift card per covered shift with clear “Covered by X” messaging.
- Preserve existing schedule functionality, but stop showing separate full-size duplicate cover blocks for the same shift.

4. Fix create/delete lifecycle
- On create/update/delete, invalidate all related query keys, not just one view, so staff/client/public/live views refresh immediately.
- Make covered-shift removal always delete the cover request by request id, not the underlying schedule.
- Keep normal shift deletion available, but clearly separate it from cover removal so the wrong record is not deleted.

5. Make re-creation safe
- Before inserting a new standard cover, check for an exact existing `shift_swap` match and update/reuse it instead of creating conflicts.
- Ensure that after a cover is removed, the same shift/date can be requested again without stale blocking behavior.

Technical details
- Likely files:
  - `src/components/hr/StaffRequestForm.tsx`
  - `src/components/hr/RequestDetailPage.tsx`
  - `src/components/hr/StaffScheduleManager.tsx`
  - `src/components/PublicClientSchedule.tsx`
  - `src/components/hr/LiveTimelineView.tsx`
  - `src/components/DashboardLiveView.tsx`
  - `src/components/PublicLiveView.tsx`
  - `src/integrations/supabase/types.ts`
  - one new shared helper in `src/lib/` or `src/components/hr/`
  - one Supabase migration for the new structured cover metadata field
- Non-overtime payroll behavior stays unchanged: standard cover remains `shift_swap` with `overtime_type = null`.

Verification
- Create a standard cover for individual shifts and confirm it appears immediately in:
  - staff view
  - client view
  - public client view
  - live views
- Delete that cover from the schedule and confirm:
  - the cover disappears everywhere
  - the original shift remains intact
  - the same shift/date can be requested again
- Test single-shift, multi-shift, recurring-pattern, and holiday-day cover scenarios to make sure all views stay aligned.
