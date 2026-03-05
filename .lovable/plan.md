

# Fix: Overtime Double-Counting When Multiple Shifts Fall on Same Day

## Problem
When a shift cover request includes multiple shifts on the same calendar day (e.g., a morning shift 07:00-10:00 and an evening shift 17:30-22:00 on the same date), the system counts each shift as a separate overtime day. Gloria and Comfort both have requests covering 4 shifts across 2 days, but the system reports 4 overtime days instead of 2.

**Root cause**: The `days_requested` field on the `staff_requests` table stores the number of shifts selected, not unique calendar days. Both `StaffPayManager.tsx` and `MyHRProfile.tsx` use this value directly for overtime day counting.

## Data Evidence
- Gloria's request: `start_date: 2026-03-19`, `end_date: 2026-03-20`, `days_requested: 4` (4 shifts, 2 days)
- Comfort's request: same pattern, `days_requested: 4`

## Fix Strategy
Instead of relying on `days_requested` for overtime day counting, calculate the actual number of unique calendar days from the request's date range. This ensures that two shifts on the same day count as one overtime day.

## Files to Change

### 1. `src/components/hr/StaffPayManager.tsx` (Payroll view)
**Lines ~696-740** — Where `userOvertimeRequests.forEach` calculates `requestStandardOTDays` and `requestDoubleUpOTDays`:
- Replace `daysInMonth = req.days_requested` with a calculation of unique working days in the date range using `eachDayOfInterval` to enumerate calendar days and count unique dates (excluding weekends if needed).
- The key change: instead of using `req.days_requested` as the base count, count unique calendar days in the overlap between the request range and the current month.

**Lines ~749-771** — Where request-based `overtimeDayDetails` are populated:
- Already iterates day-by-day, but the issue is the `requestStandardOTDays`/`requestDoubleUpOTDays` counts above are used for the pay calculation separately from the day-by-day details.

### 2. `src/components/hr/MyHRProfile.tsx` (Pay Forecast view)
**Lines ~619-637** — Where `approvedOvertimeRequests.forEach` processes each request:
- Same fix: instead of using `req.days_requested` via `maxDaysToCount`, iterate through unique calendar days in the overlap range using `eachDayOfInterval` and call `upsertOvertimeShift` for each unique date.
- The `upsertOvertimeShift` function already deduplicates by date, so the fix is simply to not limit iteration by `days_requested`.

## Specific Logic Change (both files)

**Before** (MyHRProfile):
```typescript
const daysInRange = eachDayOfInterval({ start: overlapStart, end: overlapEnd });
const maxDaysToCount = Math.min(req.days_requested || daysInRange.length, daysInRange.length);
for (let i = 0; i < maxDaysToCount; i++) {
  upsertOvertimeShift(format(daysInRange[i], 'yyyy-MM-dd'), subtype, 'request');
}
```

**After** (MyHRProfile):
```typescript
const daysInRange = eachDayOfInterval({ start: overlapStart, end: overlapEnd });
for (const day of daysInRange) {
  upsertOvertimeShift(format(day, 'yyyy-MM-dd'), subtype, 'request');
}
```

**Before** (StaffPayManager):
```typescript
let daysInMonth = req.days_requested;
// ... proportioning logic ...
if (isInsideHours) {
  requestDoubleUpOTDays += daysInMonth;
} else {
  requestStandardOTDays += daysInMonth;
}
overtimeDays += daysInMonth;
```

**After** (StaffPayManager):
```typescript
// Count unique calendar days in the overlap, not shifts
const effectiveDaysInRange = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
const uniqueCalendarDays = effectiveDaysInRange.length;
let daysInMonth = uniqueCalendarDays;

if (isInsideHours) {
  requestDoubleUpOTDays += daysInMonth;
} else {
  requestStandardOTDays += daysInMonth;
}
overtimeDays += daysInMonth;
```

And similarly update the `overtimeDayDetails` loop (lines ~749-771) to use unique calendar days.

## Impact
- Gloria: 4 days @ 1.5x → 2 days @ 1.5x (correct)
- Comfort: same correction for her 4-shift/2-day request
- No changes to the rich text editor
- No removal of existing functionality

