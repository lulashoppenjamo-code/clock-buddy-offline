
CREATE TYPE public.cleaning_frequency AS ENUM ('daily', 'weekly', 'monthly');

CREATE TABLE public.cleaning_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  branch text NOT NULL CHECK (branch IN ('mina','morelos')),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_areas TO authenticated;
GRANT ALL ON public.cleaning_areas TO service_role;
ALTER TABLE public.cleaning_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their cleaning areas" ON public.cleaning_areas
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.cleaning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  area_id uuid NOT NULL REFERENCES public.cleaning_areas(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  frequency public.cleaning_frequency NOT NULL DEFAULT 'daily',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_tasks TO authenticated;
GRANT ALL ON public.cleaning_tasks TO service_role;
ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their cleaning tasks" ON public.cleaning_tasks
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.cleaning_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.cleaning_tasks(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.cleaning_areas(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch text NOT NULL,
  client_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  photo_before_path text,
  photo_after_path text,
  latitude double precision,
  longitude double precision,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_logs TO authenticated;
GRANT ALL ON public.cleaning_logs TO service_role;
ALTER TABLE public.cleaning_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their cleaning logs" ON public.cleaning_logs
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX idx_cleaning_areas_owner ON public.cleaning_areas(owner_id, branch);
CREATE INDEX idx_cleaning_tasks_area ON public.cleaning_tasks(area_id);
CREATE INDEX idx_cleaning_logs_task ON public.cleaning_logs(task_id, completed_at DESC);
CREATE INDEX idx_cleaning_logs_owner ON public.cleaning_logs(owner_id, completed_at DESC);
