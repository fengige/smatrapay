ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meters_agent_id_idx ON public.meters (agent_id);

CREATE POLICY "Agents can view their meters"
  ON public.meters
  FOR SELECT
  TO authenticated
  USING (auth.uid() = agent_id);