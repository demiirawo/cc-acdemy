-- Insert historical leave records into staff_requests as approved
-- request_type: 'holiday_paid' for paid leave, 'holiday_unpaid' for unpaid leave

INSERT INTO public.staff_requests (user_id, request_type, start_date, end_date, days_requested, status, details) VALUES
-- Wahida hafsat mohammed (0e239c53-2000-460e-b1bc-ef1b665304d6)
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2025-01-02', '2025-01-03', 2, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2025-01-06', '2025-01-06', 4, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2026-01-10', '2026-01-18', 9, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2025-04-25', '2025-04-25', 1, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2025-04-28', '2025-04-30', 3, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2024-08-08', '2024-08-08', 1, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2024-08-15', '2024-08-16', 2, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2024-08-19', '2024-08-19', 1, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2024-08-30', '2024-08-30', 1, 'approved', 'Imported from historical records'),
('0e239c53-2000-460e-b1bc-ef1b665304d6', 'holiday_paid', '2025-08-29', '2025-09-02', 3, 'approved', 'Imported - to be covered by Zainab'),

-- Otitoju Oluwafunmilayo / funmi.otitoju (58d96c5e-cd04-43bc-b32e-4b206ae8c514)
('58d96c5e-cd04-43bc-b32e-4b206ae8c514', 'holiday_paid', '2026-01-17', '2026-01-21', 5, 'approved', 'Imported from historical records'),

-- Oma Fyneface (14d1d7f1-5247-47df-b8aa-2fb9e088f80a)
('14d1d7f1-5247-47df-b8aa-2fb9e088f80a', 'holiday_paid', '2026-01-13', '2026-01-26', 14, 'approved', 'Imported - Covered by Lynda'),

-- Callista Emiantor (d8326b8d-d888-4cbc-a822-ac4006402837)
('d8326b8d-d888-4cbc-a822-ac4006402837', 'holiday_paid', '2026-01-04', '2026-01-09', 6, 'approved', 'Imported from historical records'),

-- Gloria Unije (83df9ac9-f945-45df-ad5b-17ff090be779)
('83df9ac9-f945-45df-ad5b-17ff090be779', 'holiday_paid', '2026-01-10', '2026-01-25', 11, 'approved', 'Imported from historical records'),

-- Omasan Ogbe (22c17171-8928-4110-a083-71f1f0188148)
('22c17171-8928-4110-a083-71f1f0188148', 'holiday_paid', '2026-01-29', '2026-02-13', 12, 'approved', 'Imported from historical records'),
('22c17171-8928-4110-a083-71f1f0188148', 'holiday_unpaid', '2025-07-17', '2025-07-18', 2, 'approved', 'Imported from historical records'),
('22c17171-8928-4110-a083-71f1f0188148', 'holiday_paid', '2025-12-25', '2026-01-01', 2, 'approved', 'Imported - Time off given by client'),

-- Neebee Victory Legborsi (d114ffcc-ee43-478a-afc5-056bc40e33e6)
('d114ffcc-ee43-478a-afc5-056bc40e33e6', 'holiday_paid', '2025-02-06', '2025-02-06', 1, 'approved', 'Imported from historical records'),
('d114ffcc-ee43-478a-afc5-056bc40e33e6', 'holiday_paid', '2025-02-08', '2025-02-09', 2, 'approved', 'Imported from historical records'),
('d114ffcc-ee43-478a-afc5-056bc40e33e6', 'holiday_paid', '2025-05-03', '2025-05-04', 2, 'approved', 'Imported from historical records'),
('d114ffcc-ee43-478a-afc5-056bc40e33e6', 'holiday_unpaid', '2025-06-19', '2025-06-19', 1, 'approved', 'Imported - Sickness'),
('d114ffcc-ee43-478a-afc5-056bc40e33e6', 'holiday_paid', '2025-09-06', '2025-09-07', 2, 'approved', 'Imported from historical records'),
('d114ffcc-ee43-478a-afc5-056bc40e33e6', 'holiday_unpaid', '2025-09-10', '2025-09-11', 2, 'approved', 'Imported - Sickness absence'),
('d114ffcc-ee43-478a-afc5-056bc40e33e6', 'holiday_paid', '2025-12-06', '2025-12-14', 7, 'approved', 'Imported - Eunice to provide'),

-- Tarelayifa Koinyan (25e1fece-e236-490a-b8e6-c95fe0fe086a)
('25e1fece-e236-490a-b8e6-c95fe0fe086a', 'holiday_paid', '2026-02-09', '2026-02-13', 5, 'approved', 'Imported from historical records'),
('25e1fece-e236-490a-b8e6-c95fe0fe086a', 'holiday_paid', '2025-08-14', '2025-08-15', 2, 'approved', 'Imported from historical records'),

-- Hauwa Alkali Habib (bbadefdd-4f98-4644-92f4-73bd4eae93fa)
('bbadefdd-4f98-4644-92f4-73bd4eae93fa', 'holiday_paid', '2025-03-17', '2025-04-04', 19, 'approved', 'Imported from historical records'),
('bbadefdd-4f98-4644-92f4-73bd4eae93fa', 'holiday_unpaid', '2025-06-06', '2025-06-08', 2, 'approved', 'Imported - Muslim holiday'),
('bbadefdd-4f98-4644-92f4-73bd4eae93fa', 'holiday_unpaid', '2025-11-18', '2025-11-18', 1, 'approved', 'Imported - Graduation'),

-- Oluwatofunmi Ajayi (08bbfbdd-9dd6-4700-92dc-9083ebc35ada)
('08bbfbdd-9dd6-4700-92dc-9083ebc35ada', 'holiday_paid', '2025-04-30', '2025-05-02', 3, 'approved', 'Imported from historical records'),
('08bbfbdd-9dd6-4700-92dc-9083ebc35ada', 'holiday_paid', '2025-12-22', '2026-01-02', 10, 'approved', 'Imported from historical records'),

-- Jolayemi U. Ekpo (043a1971-aa46-4059-a471-8477ff610bb1)
('043a1971-aa46-4059-a471-8477ff610bb1', 'holiday_paid', '2025-06-24', '2025-06-24', 1, 'approved', 'Imported from historical records'),
('043a1971-aa46-4059-a471-8477ff610bb1', 'holiday_paid', '2024-12-02', '2024-12-02', 1, 'approved', 'Imported from historical records'),
('043a1971-aa46-4059-a471-8477ff610bb1', 'holiday_paid', '2024-12-03', '2024-12-03', 1, 'approved', 'Imported from historical records'),
('043a1971-aa46-4059-a471-8477ff610bb1', 'holiday_paid', '2024-12-27', '2024-12-27', 1, 'approved', 'Imported from historical records'),
('043a1971-aa46-4059-a471-8477ff610bb1', 'holiday_paid', '2024-12-30', '2024-12-30', 1, 'approved', 'Imported from historical records'),
('043a1971-aa46-4059-a471-8477ff610bb1', 'holiday_paid', '2024-12-31', '2024-12-31', 1, 'approved', 'Imported from historical records'),
('043a1971-aa46-4059-a471-8477ff610bb1', 'holiday_paid', '2025-12-24', '2026-01-02', 6, 'approved', 'Imported from historical records'),

-- Racheal (1bbeda02-fca3-4294-ac57-9d13d1502774)
('1bbeda02-fca3-4294-ac57-9d13d1502774', 'holiday_paid', '2025-07-02', '2025-07-06', 4, 'approved', 'Imported from historical records'),

-- Zainab (fb53c703-a449-4541-ae33-5e759fcfc16b)
('fb53c703-a449-4541-ae33-5e759fcfc16b', 'holiday_paid', '2025-08-06', '2025-08-08', 3, 'approved', 'Imported - to be covered by Wahida'),
('fb53c703-a449-4541-ae33-5e759fcfc16b', 'holiday_paid', '2025-12-25', '2026-01-01', 3, 'approved', 'Imported - Aden Healthcare office closure'),

-- Comfort Ochiba (8b7f9b94-a430-4f99-b427-ed28ab074672)
('8b7f9b94-a430-4f99-b427-ed28ab074672', 'holiday_paid', '2025-08-18', '2025-08-25', 6, 'approved', 'Imported - Covered by Blessing'),
('8b7f9b94-a430-4f99-b427-ed28ab074672', 'holiday_paid', '2025-12-11', '2025-12-13', 3, 'approved', 'Imported from historical records'),

-- Pese Alo (36de8ff2-23fa-423a-ab5f-b888983172ff)
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2025-08-19', '2025-08-19', 1, 'approved', 'Imported from historical records'),
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2025-08-26', '2025-08-26', 1, 'approved', 'Imported from historical records'),
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2024-12-04', '2024-12-04', 1, 'approved', 'Imported from historical records'),
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2024-12-06', '2024-12-06', 1, 'approved', 'Imported from historical records'),
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2024-12-09', '2024-12-09', 1, 'approved', 'Imported from historical records'),
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2025-10-16', '2025-10-17', 2, 'approved', 'Imported from historical records'),
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2025-12-25', '2026-01-01', 2, 'approved', 'Imported - Verona'),
('36de8ff2-23fa-423a-ab5f-b888983172ff', 'holiday_paid', '2025-12-26', '2025-12-26', 1, 'approved', 'Imported - Dictra'),

-- Oluwamurewa Alo (4f0c12a2-ec55-475c-a609-aafd870bbc1d)
('4f0c12a2-ec55-475c-a609-aafd870bbc1d', 'holiday_paid', '2025-08-27', '2025-08-30', 3, 'approved', 'Imported from historical records'),
('4f0c12a2-ec55-475c-a609-aafd870bbc1d', 'holiday_paid', '2025-12-25', '2026-01-01', 2, 'approved', 'Imported from historical records'),

-- Chidera Nnam (27b124d2-6c6f-4016-adc5-b6795a5165c9)
('27b124d2-6c6f-4016-adc5-b6795a5165c9', 'holiday_paid', '2024-09-01', '2024-09-01', 1, 'approved', 'Imported from historical records'),
('27b124d2-6c6f-4016-adc5-b6795a5165c9', 'holiday_paid', '2025-10-28', '2025-10-30', 3, 'approved', 'Imported from historical records'),
('27b124d2-6c6f-4016-adc5-b6795a5165c9', 'holiday_paid', '2025-12-25', '2025-12-26', 2, 'approved', 'Imported from historical records'),

-- Peace Jimoh (60cb0ec9-7b78-4597-b2ef-1fccf26c02cb)
('60cb0ec9-7b78-4597-b2ef-1fccf26c02cb', 'holiday_paid', '2024-09-06', '2024-09-07', 1, 'approved', 'Imported from historical records'),
('60cb0ec9-7b78-4597-b2ef-1fccf26c02cb', 'holiday_paid', '2025-09-08', '2025-09-11', 4, 'approved', 'Imported - Birthday'),
('60cb0ec9-7b78-4597-b2ef-1fccf26c02cb', 'holiday_paid', '2025-12-25', '2025-12-25', 1, 'approved', 'Imported from historical records'),
('60cb0ec9-7b78-4597-b2ef-1fccf26c02cb', 'holiday_paid', '2025-12-31', '2026-01-01', 2, 'approved', 'Imported from historical records'),

-- Taiwo (916f7ef0-ac61-47f4-9ab7-0713f0f7b2ac)
('916f7ef0-ac61-47f4-9ab7-0713f0f7b2ac', 'holiday_unpaid', '2025-09-26', '2025-09-26', 1, 'approved', 'Imported from historical records'),
('916f7ef0-ac61-47f4-9ab7-0713f0f7b2ac', 'holiday_paid', '2025-10-31', '2025-10-31', 1, 'approved', 'Imported from historical records'),
('916f7ef0-ac61-47f4-9ab7-0713f0f7b2ac', 'holiday_paid', '2025-12-25', '2025-12-25', 1, 'approved', 'Imported from historical records'),
('916f7ef0-ac61-47f4-9ab7-0713f0f7b2ac', 'holiday_paid', '2025-12-31', '2025-12-31', 1, 'approved', 'Imported from historical records'),

-- Pelinah (6547c6a9-e0d2-4dda-b85a-8a3fc6e77a46)
('6547c6a9-e0d2-4dda-b85a-8a3fc6e77a46', 'holiday_paid', '2025-09-30', '2025-10-06', 5, 'approved', 'Imported from historical records'),

-- Bukola Faola (85e50fdb-4715-4c04-811e-66ce5182e778)
('85e50fdb-4715-4c04-811e-66ce5182e778', 'holiday_paid', '2024-11-15', '2024-11-15', 1, 'approved', 'Imported from historical records'),
('85e50fdb-4715-4c04-811e-66ce5182e778', 'holiday_paid', '2025-11-14', '2025-11-14', 1, 'approved', 'Imported from historical records'),

-- Emnet Okene (bd7befe8-364d-4843-b1d7-70529e972061)
('bd7befe8-364d-4843-b1d7-70529e972061', 'holiday_paid', '2025-11-19', '2025-11-26', 6, 'approved', 'Imported - 19th, 20th, 22nd, 24th, 25th and 26th'),
('bd7befe8-364d-4843-b1d7-70529e972061', 'holiday_paid', '2025-12-25', '2025-12-25', 1, 'approved', 'Imported from historical records'),

-- Victoria Nwabua (21b96fa7-272e-42d8-b320-b258cd2f76e8)
('21b96fa7-272e-42d8-b320-b258cd2f76e8', 'holiday_paid', '2025-12-22', '2026-01-04', 11, 'approved', 'Imported - Eunice to provide'),

-- Yoyin Sanusi (05b64980-a772-4e82-aff7-2bc1b5e962bf)
('05b64980-a772-4e82-aff7-2bc1b5e962bf', 'holiday_paid', '2025-12-25', '2025-12-26', 2, 'approved', 'Imported from historical records'),

-- Mariam Ibitoye (f5558552-3b77-41dc-9515-7c45ec197990)
('f5558552-3b77-41dc-9515-7c45ec197990', 'holiday_paid', '2025-12-24', '2026-01-04', 11, 'approved', 'Imported from historical records'),

-- Rich-Hope (e21a16a1-e53a-443f-bd4e-618df11198a6)
('e21a16a1-e53a-443f-bd4e-618df11198a6', 'holiday_paid', '2025-12-23', '2026-01-01', 10, 'approved', 'Imported from historical records'),

-- Dumebi John-Okeke (5ab2c0c0-bc64-49ab-b659-8320036a6b90)
('5ab2c0c0-bc64-49ab-b659-8320036a6b90', 'holiday_paid', '2025-12-24', '2025-12-26', 3, 'approved', 'Imported from historical records'),
('5ab2c0c0-bc64-49ab-b659-8320036a6b90', 'holiday_paid', '2025-12-31', '2026-01-02', 3, 'approved', 'Imported from historical records'),

-- Whitney Stephen (bbd8383c-6ed6-4ff9-b2c9-1b8eb794624c)
('bbd8383c-6ed6-4ff9-b2c9-1b8eb794624c', 'holiday_paid', '2025-12-24', '2025-12-26', 3, 'approved', 'Imported from historical records'),
('bbd8383c-6ed6-4ff9-b2c9-1b8eb794624c', 'holiday_paid', '2025-12-31', '2026-01-02', 3, 'approved', 'Imported from historical records'),

-- Eunice Oyinola (a0613491-927b-45a8-9c4b-30cde1578621)
('a0613491-927b-45a8-9c4b-30cde1578621', 'holiday_paid', '2025-12-24', '2025-12-26', 3, 'approved', 'Imported from historical records'),
('a0613491-927b-45a8-9c4b-30cde1578621', 'holiday_paid', '2025-12-31', '2026-01-02', 3, 'approved', 'Imported from historical records'),

-- Lade Ajayi (b8898dd7-d736-4a5d-8847-a818605b31b4)
('b8898dd7-d736-4a5d-8847-a818605b31b4', 'holiday_paid', '2025-12-25', '2026-01-01', 2, 'approved', 'Imported - iCareServices offices closed'),

-- Hannah Osondu (4b1edb1c-be88-420e-8818-567616fa9aeb)
('4b1edb1c-be88-420e-8818-567616fa9aeb', 'holiday_paid', '2025-12-26', '2025-12-26', 1, 'approved', 'Imported from historical records'),
('4b1edb1c-be88-420e-8818-567616fa9aeb', 'holiday_paid', '2025-12-31', '2025-12-31', 1, 'approved', 'Imported from historical records');