
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS total_income numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget numeric(14,2) DEFAULT 0;
