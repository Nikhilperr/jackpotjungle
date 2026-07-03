-- 1. Add is_admin_team column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_admin_team BOOLEAN DEFAULT false;

-- 2. Create trigger function to enforce only admins can create/modify admin team groups
CREATE OR REPLACE FUNCTION public.check_group_admin_team_creation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_admin_team = true THEN
    IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
      RAISE EXCEPTION 'Only administrators can create or modify admin team groups.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_group_admin_team_creation ON public.groups;
CREATE TRIGGER trg_check_group_admin_team_creation
BEFORE INSERT OR UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.check_group_admin_team_creation();

-- 3. Create trigger function to enforce only admins can join admin team groups
CREATE OR REPLACE FUNCTION public.check_admin_team_membership()
RETURNS TRIGGER AS $$
DECLARE
  g_admin_team BOOLEAN;
  u_is_admin BOOLEAN;
BEGIN
  SELECT is_admin_team INTO g_admin_team FROM public.groups WHERE id = NEW.group_id;
  
  IF g_admin_team = true THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = NEW.user_id AND role IN ('admin', 'super_admin')
    ) INTO u_is_admin;
    
    IF u_is_admin = false THEN
      RAISE EXCEPTION 'Only administrators can be members of admin team groups.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_admin_team_membership ON public.group_members;
CREATE TRIGGER trg_check_admin_team_membership
BEFORE INSERT OR UPDATE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.check_admin_team_membership();
