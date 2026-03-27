-- Add INSERT, UPDATE, DELETE policies for anon role on surplus_adjustments
-- to match the existing SELECT policy. RLS access control is handled at the
-- application layer (custom auth), not via Supabase Auth.

CREATE POLICY "Enable insert access for all users" ON surplus_adjustments
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON surplus_adjustments
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete access for all users" ON surplus_adjustments
  FOR DELETE TO anon USING (true);
