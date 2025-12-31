-- Update start dates for all HR profiles

UPDATE hr_profiles SET start_date = '2024-07-12' WHERE id = 'd53f0048-f221-48a4-a5fe-a37860e89f54'; -- Sam George
UPDATE hr_profiles SET start_date = '2024-08-15' WHERE id = 'b948a59d-1246-43c6-913b-ff6c37885f0c'; -- Hauwa Habib
UPDATE hr_profiles SET start_date = '2025-01-21' WHERE id = '480b02a2-49a0-48c9-93ce-4bc93c2c060a'; -- Ore Omowaye (Administrator account)
UPDATE hr_profiles SET start_date = '2024-08-08' WHERE id = '493b54a0-344c-49d8-b6da-2f8493ee7c7b'; -- Faola Bukola C (bukola.faola)
UPDATE hr_profiles SET start_date = '2024-09-20' WHERE id = '2b566ef9-1675-4c06-bea3-5bb549a2b607'; -- Omasan Ogbe
UPDATE hr_profiles SET start_date = '2025-07-21' WHERE id = 'bf337b44-382b-41bc-8cf8-aba2dff195be'; -- Osibogun Kehinde
UPDATE hr_profiles SET start_date = '2025-06-09' WHERE id = 'ea0ef5ee-7285-40d6-ad3d-d9a9f0acfe8b'; -- Lade Ajayi
UPDATE hr_profiles SET start_date = '2025-03-14' WHERE id = 'b70c5aec-35fb-4592-b8c7-91a16b805715'; -- Racheal Ayomide-Baafog
UPDATE hr_profiles SET start_date = '2025-09-15' WHERE id = 'e929236b-6f7b-4f38-ab64-18cfa48b1cbc'; -- Ghezai Eni Nkanu
UPDATE hr_profiles SET start_date = '2024-08-08' WHERE id = '4a514ecc-934d-410f-b88d-664a180f9921'; -- Chidera Mmaegbunem Nnam
UPDATE hr_profiles SET start_date = '2024-05-06' WHERE id = '94730445-3fdc-4395-8334-cbac178f6c0a'; -- Oluwamurewa Alo
UPDATE hr_profiles SET start_date = '2024-10-12' WHERE id = '1e087d1e-ab00-4919-94e9-21b93b407051'; -- Pelinah Uriah Etetegwung
UPDATE hr_profiles SET start_date = '2025-10-06' WHERE id = 'b7a30beb-2b6a-48ed-9b04-b9e3ea3ad159'; -- Asuquo Andrew Adebowale
UPDATE hr_profiles SET start_date = '2025-08-12' WHERE id = '2e2feea7-c7d0-4ba7-b3b0-df4dcfadd6e8'; -- Taiwo Agbebunmi
UPDATE hr_profiles SET start_date = '2024-10-01' WHERE id = 'b81a024e-998c-4220-a709-78a783f5b2a1'; -- Jolayemi U. Ekpo
UPDATE hr_profiles SET start_date = '2024-03-01' WHERE id = '5bfbbf92-8784-40a2-85e0-db7413f72aeb'; -- Emnet Okene
UPDATE hr_profiles SET start_date = '2024-07-23' WHERE id = '3a3b0d19-d2b8-4b76-a836-3beaebbdb3ad'; -- jimoh peace jumia
UPDATE hr_profiles SET start_date = '2024-09-12' WHERE id = '5c96ec3b-4bb7-41a3-b9a4-810ce5c8ba9e'; -- Oluwapese Gideon Alo (Pese Alo)
UPDATE hr_profiles SET start_date = '2025-06-16' WHERE id = 'df1f8971-72c8-43de-9a43-c284f51465a2'; -- Tarelayifa Koinyan
UPDATE hr_profiles SET start_date = '2025-08-11' WHERE id = '547c485b-91b5-4be5-a087-e389bfa8462b'; -- Otitoju Oluwafunmilayo (funmi.otitoju)
UPDATE hr_profiles SET start_date = '2025-10-29' WHERE id = '43d2cb1e-e84c-43f0-86a4-139318e13ef3'; -- Hannah Osondu
UPDATE hr_profiles SET start_date = '2024-08-05' WHERE id = '64071a0e-b09e-4f36-abdb-971b388084c1'; -- Neebee Victory Legborsi
UPDATE hr_profiles SET start_date = '2025-02-06' WHERE id = 'c0ba0a94-03a1-42a2-9ca9-c1335fc99446'; -- Comfort Ochiba
UPDATE hr_profiles SET start_date = '2024-12-26' WHERE id = '75483872-a639-46cd-964e-18fb99b1af61'; -- Oluwatofunmi Ajayi (tofunmi.ajayi)
UPDATE hr_profiles SET start_date = '2025-01-23' WHERE id = '3fdad6b7-7c81-463c-8a66-042d9d0d29a6'; -- Unije Gloria Nnenna
UPDATE hr_profiles SET start_date = '2024-05-03' WHERE id = '9fb23c6f-219f-4a0e-9625-0f6a2b0b5cf8'; -- Wahida hafsat mohammed
UPDATE hr_profiles SET start_date = '2025-11-03' WHERE id = 'e62d4e6a-659e-499d-acbe-377945befb79'; -- Eunice Oyinola
UPDATE hr_profiles SET start_date = '2025-12-08' WHERE id = '2f01abba-7269-4a04-ac8f-f6c66d46c0a3'; -- Dumebi Claire John-Okeke
UPDATE hr_profiles SET start_date = '2025-12-08' WHERE id = 'd71c86a7-5b7c-4500-9d90-aab60b755d57'; -- Stephen Whitney (Whitney Stephen)
UPDATE hr_profiles SET start_date = '2025-01-21' WHERE id = 'af38401a-8bf8-4d88-952b-026b200c26e3'; -- Oma Fyneface
UPDATE hr_profiles SET start_date = '2025-11-12' WHERE id = 'bf634d67-d7be-4141-8b97-8cf5c43a879d'; -- Rich-Hope Abiye-Whyte
UPDATE hr_profiles SET start_date = '2025-11-13' WHERE id = 'd989dd7a-6b4d-4cee-8052-5af0959eb0c1'; -- Lynda Iduh
UPDATE hr_profiles SET start_date = '2025-09-15' WHERE user_id = (SELECT user_id FROM profiles WHERE display_name ILIKE '%mariam%' OR display_name ILIKE '%ibitoye%' LIMIT 1); -- Ibitoye Mariam