

## Rename Overtime Labels Consistently

Renaming all overtime labels from "Standard Overtime" / "Double Up Overtime" to **"Overtime (Outside Normal Hours)"** / **"Overtime (Inside Normal Hours)"** across all files.

### Files and Changes

| File | What changes |
|------|-------------|
| **StaffRequestForm.tsx** | Lines 1009, 1015: Update dropdown labels |
| **RequestDetailPage.tsx** | Lines 55, 60: Update `REQUEST_TYPE_CONFIG` labels; Lines 809, 815: Update dropdown labels |
| **MyHRProfile.tsx** | Lines 200, 204: Update `REQUEST_TYPES` labels |
| **StaffScheduleManager.tsx** | Lines 1534, 1540: Update `getRequestTypeInfo` labels; Lines 2133-2134: Update select items |
| **UnifiedShiftEditor.tsx** | Lines 681-685, 690-691: Update select items; Lines 698-705: Update helper text |
| **StaffPayManager.tsx** | Lines 759-760: Update code comments |

### Exact Renames

| Current label | New label |
|--------------|-----------|
| Standard Overtime | Overtime (Outside Normal Hours) |
| Double Up Overtime / Double-Up Overtime | Overtime (Inside Normal Hours) |
| OT - Standard | OT (Outside) |
| OT - Double Up | OT (Inside) |
| OT×2 badge | OT (In) |
| OT badge | OT (Out) |
| Overtime – Standard Hours | Overtime (Outside Normal Hours) |
| Overtime – Outside Hours | Overtime (Inside Normal Hours) |
| Standard OT (in helper text) | OT (Outside Normal Hours) |
| Double Up OT (in helper text) | OT (Inside Normal Hours) |

### Technical Details

- No database changes — only UI labels and comments
- Internal values (`standard`, `double_up`, `overtime_standard`, `overtime_double_up`) remain unchanged
- All multiplier logic stays the same (1.5× for outside, 0.5× for inside)

