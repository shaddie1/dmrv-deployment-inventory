-- Ensure any existing user who has no role gets field_officer (safety net).
-- Then promote the first registered user to admin if they aren't already.

-- Step 1: Give field_officer to any user that somehow has no role entry
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'field_officer'::public.app_role
FROM auth.users
WHERE id NOT IN (SELECT DISTINCT user_id FROM public.user_roles)
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 2: Promote the earliest registered user (app owner) to admin if not already
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 3: Replace the broad FOR ALL shipments policy with explicit per-operation
-- policies so UPDATE can be independently adjusted in future.
DROP POLICY IF EXISTS "Admins and warehouse managers can manage shipments" ON public.shipments;

CREATE POLICY "Admins and warehouse managers can insert shipments"
  ON public.shipments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse_manager')
  );

CREATE POLICY "Admins and warehouse managers can update shipments"
  ON public.shipments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'warehouse_manager')
  );

CREATE POLICY "Admins can delete shipments"
  ON public.shipments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
