-- Allow all authenticated users to view birthdays (date_of_birth) from staff_onboarding_documents
CREATE POLICY "All authenticated users can view birthdays" 
ON public.staff_onboarding_documents 
FOR SELECT 
TO authenticated
USING (true);

-- Allow all authenticated users to view work anniversaries (start_date) from hr_profiles
CREATE POLICY "All authenticated users can view anniversaries" 
ON public.hr_profiles 
FOR SELECT 
TO authenticated
USING (true);