## Goal

Let contractor staff (paid via their limited companies) generate a branded PDF invoice for any month from their 12-Month Pay Forecast. Admins can do the same on behalf of any staff member from the payroll/forecast view. The invoice mirrors the supplied example (Care Cuddle Ltd as Bill To) and uses each contractor's stored company details.

## What gets built

### 1. Contractor billing details (one-time setup per staff)

New section on the staff member's HR profile (and editable by admins on Edit Staff): **Contractor / Invoicing Details**

Fields:
- Company Name (e.g. "KHALE CONSULT LTD")
- Requested By / Contact Name (defaults to display name)
- Phone Number (defaults to Personal Phone)
- Email (defaults to account email)
- Company Address (multi-line)
- Bank Account Name
- Bank Account Number
- Bank Name
- Optional: Sort Code / IBAN / SWIFT (extra fields for international flexibility)

Stored in a new `contractor_invoice_details` table, one row per `user_id`. Staff edit their own; admins can edit anyone's.

**Bill To** is fixed to Care Cuddle Ltd (matches the example) and stored as a single editable admin-only setting (so it can be updated centrally if the company address changes) — defaults populated from the example PDF.

### 2. Invoice numbering

A new `staff_invoices` table records every generated invoice with an auto-incrementing `invoice_number` (sequence) so numbers stay unique platform-wide and match the example's simple numeric format ("19").

Columns: id, user_id, invoice_number (int, unique), month (date — first of month), description, amount, currency, status (draft/sent), pdf_url (optional), created_at, created_by, sent_at, sent_to_emails (text[]).

### 3. Generate Invoice button — staff side (MyHRProfile, 12-Month Pay Forecast)

In each month row of the forecast (existing collapsible), add a **"Generate Invoice"** button next to the Estimated Total.

Clicking opens a dialog pre-filled with:
- Description (default: "Remote support service" — editable)
- Amount (defaults to that month's Estimated Total in the staff's currency — editable)
- Date Requested (defaults to the 1st of the payment month — editable)
- Account/company details preview (read-only — links to "Edit details" if blank)

Actions:
- **Preview PDF** — renders the invoice in a modal preview
- **Download PDF** — saves locally
- **Email Invoice** — sends to a fixed admin recipient list (uses existing Resend infra) plus optional CC to the staff member; records the invoice as `sent`

If contractor details are missing, the button is disabled with a tooltip "Add your company / bank details first" and a shortcut to the new section.

### 4. Generate Invoice — admin side

Two entry points:

a) **Per-staff row in StaffPayManager (current month payroll view)** — a new "Generate Invoice" action in the row actions menu. Same dialog, but admin can generate on behalf of any staff (uses that staff's stored contractor details).

b) **Admin view of any staff's 12-Month Forecast** — add a small "View Forecast" link on each StaffPayManager row that opens the staff's monthly forecast in a side panel/dialog with the same Generate Invoice button per month. (Reuses the calculation logic already in MyHRProfile by extracting it into a shared hook `useMonthlyPayPreviews(userId)`.)

### 5. PDF rendering

Client-side using `jspdf` + `jspdf-autotable` (already lightweight, no server cost). Layout matches the supplied example:

```text
+--------------------------------------------------+
|  [CARE CUDDLE LOGO]                              |
|                                                  |
|  Contractor Invoice                              |
|                                                  |
|  Company Name: KHALE CONSULT LTD                 |
|  Requested By: Jolayemi Ekpo                     |
|  Phone:        09071621193                       |
|  Email:        jolayemiekpo@gmail.com            |
|  Address:      David Ejoor Crescent, Abuja...    |
|                                                  |
|  Bill To:                  Date Requested:       |
|  Care Cuddle Ltd           Friday, May 1, 2026   |
|  Company No: 14893276      Invoice Number: 19    |
|  71-75 Shelton Street                            |
|  Covent Garden, London                           |
|  WC2H 9JQ, United Kingdom                        |
|                                                  |
|  Account Details to be paid                      |
|  NAME:    Jolayemi Uchenna Ekpo                  |
|  ACCOUNT: 0122152204                             |
|  BANK:    Ecobank                                |
|                                                  |
|  +-------------------------+----------------+    |
|  | Description of Job      | Amount         |    |
|  +-------------------------+----------------+    |
|  | Remote support service  | ₦ 367,500      |    |
|  +-------------------------+----------------+    |
|                                                  |
|                              Total: ₦ 367,500    |
+--------------------------------------------------+
```

Branded with Care Cuddle Academy purple (#5F17EB) accents, Figtree-equivalent font, company logo. Currency symbol matches the staff's pay currency (₦, £, etc.).

### 6. Emailing the invoice

New edge function `send-invoice-email`:
- Inputs: invoice id
- Loads invoice + contractor details + staff profile
- Generates PDF (server-side using same template via `pdf-lib` or accepts a base64 PDF generated client-side and forwards as attachment — we'll go with **client generates PDF, edge function attaches & sends** to keep one rendering pipeline)
- Sends via Resend from `hello@care-cuddle-academy.co.uk` to the admin alert recipients (re-uses existing recipient resolution logic) with the staff member CC'd
- Subject: `Invoice #{number} — {Company Name} — {Month Year}`
- Body: branded HTML matching existing email styling (purple #5F17EB, logo)

### 7. Admin: invoice log

A simple "Submitted Invoices" tab inside Pay Forecast / Payroll admin area listing all `staff_invoices` rows with filters (staff, month, status), download PDF link, and "Mark as paid" toggle (status: draft / sent / paid).

## Database changes

```sql
-- Contractor invoicing details
create table contractor_invoice_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  company_name text,
  contact_name text,
  phone text,
  email text,
  company_address text,
  bank_account_name text,
  bank_account_number text,
  bank_name text,
  sort_code text,
  iban text,
  swift text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- RLS: user can manage own; admin can manage all

-- Generated invoices
create sequence staff_invoice_number_seq start 1;
create table staff_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number int not null unique default nextval('staff_invoice_number_seq'),
  user_id uuid not null,
  month date not null,
  description text not null,
  amount numeric not null,
  currency text not null default 'GBP',
  status text not null default 'draft', -- draft | sent | paid
  sent_at timestamptz,
  sent_to_emails text[],
  created_by uuid not null,
  created_at timestamptz default now()
);
-- RLS: user can view/insert own; admin can manage all

-- Bill-to settings (single row, admin only)
create table invoice_bill_to_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default 'Care Cuddle Ltd',
  company_number text default '14893276',
  address_lines text[] default array['71-75 Shelton Street','Covent Garden','London','WC2H 9JQ','United Kingdom'],
  updated_at timestamptz default now()
);
```

## Files added / changed

- `supabase/migrations/...` — tables above
- `src/components/hr/ContractorInvoiceDetailsForm.tsx` — new
- `src/components/hr/InvoiceGeneratorDialog.tsx` — new (shared by staff + admin)
- `src/components/hr/StaffInvoicesAdmin.tsx` — new (admin invoice log)
- `src/lib/invoice/generatePdf.ts` — new (jspdf renderer)
- `src/hooks/useMonthlyPayPreviews.ts` — extract forecast calc from MyHRProfile so admin can re-use
- `src/components/hr/MyHRProfile.tsx` — add Generate Invoice button per month + Contractor Details section
- `src/components/hr/StaffPayManager.tsx` — add Generate Invoice action + link to per-staff forecast
- `supabase/functions/send-invoice-email/index.ts` — new edge function

## Out of scope (confirm if you want any added)

- Multi-line invoice items (current example is single line — we'll keep one editable line, but architecture supports adding more later)
- VAT handling
- Payment tracking/reconciliation beyond a manual "Mark as paid" toggle
- Auto-generating invoices on a schedule (will remain manual on-demand)

Approve and I'll build it.