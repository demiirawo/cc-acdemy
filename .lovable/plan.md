

## Overtime Type Distinction: Standard vs Double Up

### The Problem

Currently, overtime in the schedule (both series-level and per-day overrides) is a simple on/off toggle. There's no distinction between:

- **Standard Overtime** - working during normal hours (e.g. a public holiday that falls on a regular shift day). Pay = **1.5x their usual hourly pay for that day** (the base day pay is already in salary, so the overtime portion is 0.5x extra).
- **Double Up Overtime** - working outside normal hours (additional shifts). Pay = **additional hourly pay at 1.5x their usual hourly rate** (full 1.5x on top, since they wouldn't normally be paid for these hours).

The staff request form already has a concept of `overtime_type` (`standard_hours` / `outside_hours`), but the schedule patterns and per-day exceptions don't carry this distinction.

### What Changes

**1. Database Migration**

Add an `overtime_subtype` column to `shift_pattern_exceptions` and `recurring_shift_patterns`:

- `recurring_shift_patterns`: add `overtime_subtype TEXT DEFAULT NULL` — when `is_overtime = true`, this stores `'standard'` or `'double_up'`
- `shift_pattern_exceptions`: add `overtime_subtype TEXT DEFAULT NULL` — for per-day overtime overrides, stores the type

**2. Schedule Editor (UnifiedShiftEditor.tsx)**

When marking overtime (either for the whole series or per-day):

- Replace the simple "Mark as overtime" checkbox with a dropdown/radio that offers three states: **Not Overtime**, **Standard Overtime**, **Double Up Overtime**
- For the per-day button, similarly ask which type of overtime
- The series-level overtime stores in `recurring_shift_patterns.is_overtime` + `overtime_subtype`
- The per-day override stores in `shift_pattern_exceptions.exception_type` (overtime/not_overtime) + `overtime_subtype`

**3. Schedule Display (StaffScheduleManager.tsx)**

- When rendering shifts marked as overtime, show a visual indicator of the type (e.g. badge saying "OT" vs "OT x2" or "Standard OT" vs "Double Up")

**4. Payroll Calculation (StaffPayManager.tsx)**

Currently all overtime uses: `1.5 × (Base Salary / 20) × Overtime Days`

Updated logic:
- **Standard Overtime**: `0.5 × dailyRate × days` (the base pay is already in salary; only the 0.5x premium is added)
- **Double Up Overtime**: `1.5 × dailyRate × days` (full additional pay at 1.5x since these are extra hours outside normal schedule)

The payroll loop that counts overtime days from patterns will need to track two separate counters: `standardOvertimeDays` and `doubleUpOvertimeDays`, reading the subtype from the pattern default or per-day exception override.

**5. Pay Forecast (MyHRProfile.tsx)**

Same calculation update as StaffPayManager — split overtime into standard vs double up with the correct multipliers.

### Technical Details

```text
recurring_shift_patterns
├── is_overtime: boolean (existing)
└── overtime_subtype: 'standard' | 'double_up' | null (new)

shift_pattern_exceptions
├── exception_type: 'deleted' | 'overtime' | 'not_overtime' (existing)
└── overtime_subtype: 'standard' | 'double_up' | null (new)

Payroll calculation:
  Standard OT:  0.5 × (monthly_salary / 20) × standard_days
  Double Up OT: 1.5 × (monthly_salary / 20) × double_up_days
```

### Files to Change

| File | Change |
|------|--------|
| DB migration | Add `overtime_subtype` to `recurring_shift_patterns` and `shift_pattern_exceptions` |
| `UnifiedShiftEditor.tsx` | Replace overtime checkbox with type selector (None / Standard / Double Up); update per-day button to also ask type |
| `StaffScheduleManager.tsx` | Pass overtime subtype through virtual schedule generation; show type badge on schedule |
| `StaffPayManager.tsx` | Split overtime counting into standard vs double up; apply different multipliers |
| `MyHRProfile.tsx` | Same payroll formula update for pay forecast |
| `DashboardLiveViewWrapper.tsx` | Pass through overtime subtype if displayed in live view |

### No Changes To

- Rich text editor (preserved per guardrail)
- Existing request form overtime_type logic (already has standard_hours/outside_hours distinction for requests)

