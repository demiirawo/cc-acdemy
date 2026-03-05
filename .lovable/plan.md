

# Fix: Public Holiday Overtime Paid to Staff on Leave

## Problem
Staff members who are on approved holiday (paid or unpaid) on a public holiday date are incorrectly receiving public holiday overtime pay (0.5x daily rate). For example, on March 20 (Eid-el-Fitr), staff like Hannah Osondu, Hauwa Habib, Racheal Ayomide-Baafog, and Wahida Mohammed all have approved paid leave covering that date, yet they still receive public holiday overtime because their recurring shift patterns generate virtual schedules for that day.

**Root cause**: Neither `StaffPayManager.tsx` nor `MyHRProfile.tsx` checks whether the staff member has an approved leave request (`holiday_paid` or `holiday_unpaid`) covering a public holiday date before awarding the 0.5x premium.

## Data Evidence (March 20, 2026 — Eid-el-Fitr)
- Hannah Osondu: `holiday_paid` from Mar 16-20 — should NOT get public holiday overtime
- Hauwa Habib: `holiday_paid` from Mar 2-25 — should NOT get public holiday overtime  
- Racheal Ayomide-Baafog: `holiday_paid` from Mar 17-20 — should NOT get public holiday overtime
- Wahida Mohammed: `holiday_paid` from Mar 19-20 — should NOT get public holiday overtime
- Comfort Ochiba: has both `shift_swap` (cover work) AND `holiday_paid` Mar 19-23 — the holiday should take precedence; she's on leave, not working

## Fix Strategy
Before counting a date as a public holiday overtime day, check if the user has an approved leave request (`holiday_paid` or `holiday_unpaid`) covering that date. If they do, exclude that date from public holiday overtime.

## Files to Change

### 1. `src/components/hr/StaffPayManager.tsx`
- **Build a leave dates set per user**: Before the public holiday overtime calculation (~line 592), gather all approved `holiday_paid` and `holiday_unpaid` requests for the user and enumerate the calendar dates they cover into a `Set<string>`.
- **Filter public holiday checks**: In all three sections (actual schedules ~597, virtual schedules ~612, cover requests ~629), add a condition: skip the date if it's in the user's leave dates set.

Data source: Need to fetch `holiday_paid` and `holiday_unpaid` approved requests. The `staffHolidays` state already exists but only has `days_taken` and `start_date` — it lacks `end_date`. Will use the existing `staff_requests` data instead, filtering for `holiday_paid`/`holiday_unpaid` with `status = 'approved'`.

The existing fetch at ~line 400 pulls from `staff_holidays`, but we need `staff_requests` with leave types. Will add a new fetch or reuse `approvedOvertimeRequests` by broadening it — but cleaner to add a separate `approvedLeaveRequests` state.

### 2. `src/components/hr/MyHRProfile.tsx`
- Same approach: before the public holiday overtime section (~line 500), build a set of leave dates from `staffRequests` (already available in scope) filtered for `holiday_paid`/`holiday_unpaid` with `status = 'approved'`.
- Skip any public holiday date that falls within an approved leave period.

## Specific Logic (both files)

```typescript
// Build set of dates the user is on approved leave
const leaveDates = new Set<string>();
const userLeaveRequests = /* filter for holiday_paid / holiday_unpaid, status approved */;
userLeaveRequests.forEach(req => {
  const start = parseISO(req.start_date);
  const end = parseISO(req.end_date);
  const days = eachDayOfInterval({ start, end });
  days.forEach(d => leaveDates.add(format(d, 'yyyy-MM-dd')));
});

// Then in each holiday check, add:
if (leaveDates.has(dateStr)) continue; // Skip — staff is on leave
```

## Impact
- Staff on approved leave will no longer receive the 0.5x public holiday premium
- Staff who are genuinely working (via recurring patterns, actual schedules, or cover requests) on public holidays will continue to receive it
- Both Payroll and Pay Forecast views will be consistent
- No changes to the rich text editor
- No removal of existing functionality

