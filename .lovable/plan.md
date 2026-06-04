## Plan

1. Make the detail view use the submitted candidate list passed in from the results screen as the single source of truth for Prev/Next navigation.
2. Remove the extra status-based re-filtering inside `ResultDetail` that is causing the current record to drop out of the sibling list and disabling the buttons.
3. Keep rejected candidates out of navigation entirely: when a candidate is rejected from the detail screen, immediately move to the next available submitted candidate (or previous one if needed).
4. Verify the Pending Review flow end to end so opening a candidate from that list only cycles through submitted assessments and never shows rejected records.

## Technical details

- `ResultsDashboard` already builds the correct submitted-only list for Pending Review via `sortedRows.map((r) => r.id)`.
- `ResultDetail` should trust that incoming `siblingIds` list instead of re-querying statuses and rebuilding navigation from database state.
- On reject, update local sibling state by removing the current id and navigate to the nearest remaining sibling.
- Validate the exact user flow: Pending Review -> open candidate -> Prev/Next works -> reject candidate -> rejected record disappears from navigation.