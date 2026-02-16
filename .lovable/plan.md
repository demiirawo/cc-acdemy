

## Allow Partial Holiday Cover (Individual Day Selection)

### The Problem
When submitting a Shift Cover request and choosing "Holiday Days", the current flow forces you to cover the **entire holiday period**. There is no way to select specific days within that holiday -- for example, covering just 2 out of 6 holiday days.

The "Individual Shifts" option does allow granular selection (with checkboxes), but "Holiday Days" only has a dropdown that selects the whole range.

### The Solution
After selecting an approved holiday to cover, show a list of the **working days within that holiday period** (based on the person's shift patterns), each with a checkbox. The user can then select which specific days they want to cover. By default, all days are pre-selected so the existing behaviour of "cover the whole holiday" still works with a single click.

### How It Will Work (User Flow)
1. Select "Shift Cover" as request type
2. Pick the staff member
3. Choose "Holiday Days"
4. Select the approved holiday from the dropdown
5. **NEW**: A checklist of working days within that holiday appears (pre-selected)
6. Uncheck any days you do not want to cover
7. The covering period summary and days count update to reflect only the selected days
8. Submit as normal

### Technical Details

**File: `src/components/hr/StaffRequestForm.tsx`**

**1. Add state for selected cover days**
- New state: `selectedCoverDays` -- an array of date strings (yyyy-MM-dd) the user has checked
- Reset this when the holiday selection changes

**2. Generate working days for the selected holiday**
- Reuse the existing `calculateActualWorkingDays` pattern logic to enumerate which dates within the holiday are actual working days for the person being covered
- Present these as checkboxes (same UI pattern as the shift selection checkboxes)

**3. Auto-select all days by default**
- When a holiday is selected, pre-populate `selectedCoverDays` with all working days so existing behaviour is preserved

**4. Update the submission logic**
- Instead of using the full holiday date range, use the min/max of selected days as `start_date`/`end_date`
- Set `days_requested` to the count of selected days
- Include the specific covered dates in the `details` field

**5. Update the covering period summary**
- The info box below the holiday dropdown should reflect the selected days count rather than the full holiday range

No database schema changes required. No changes to any other components.
