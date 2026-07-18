-- Payroll edits (bonus pot, overtime, deductions) need to reach the Finance
-- section's P&L live, without a page reload.
alter publication supabase_realtime add table public.staff_pay_records;
