

## Consistent "This & Future Shifts" Delete Option Across Schedule Views

### The Problem
The delete functionality for recurring shift patterns is inconsistent across the scheduling views:

- **UnifiedShiftEditor** (used when editing a shift): Has all 3 delete options -- "Just This Shift", "This & Future", and "Entire Pattern". This is the correct, complete implementation.
- **StaffScheduleManager** (main schedule grid): Only has 2 options -- "Delete Just This Shift" and "Delete Entire Series". The "This & Future" option is **missing**.
- **PublicClientSchedule**: No shift deletion (only holiday deletion) -- not relevant here.

### The Fix
Update **StaffScheduleManager.tsx** to add the missing "This & Future" delete option, using the same logic already proven in `UnifiedShiftEditor`.

### Technical Details

**1. Add a "delete future shifts" mutation to `StaffScheduleManager.tsx`**
- Create a new mutation that sets the recurring pattern's `end_date` to the day before the selected shift occurrence (same approach as `UnifiedShiftEditor.deleteFutureShiftsMutation`)

**2. Update `handleDeleteConfirm` to accept 3 options**
- Change the signature from `(deleteEntireSeries: boolean)` to `(deleteType: 'single' | 'future' | 'all')`
- Add the `'future'` branch that calls the new mutation

**3. Update the Delete Confirmation Dialog UI**
- Replace the current 2-button layout with the 3-button layout matching `UnifiedShiftEditor`:
  - **"Just This Shift"** (orange) -- creates an exception for this date only
  - **"This & Future"** (amber) -- sets the pattern's end_date to the day before
  - **"Entire Pattern"** (red/destructive) -- deletes the whole pattern

No changes to `PublicClientSchedule` as shift deletion is not available on the public view. No changes to `UnifiedShiftEditor` as it already has the complete implementation.
