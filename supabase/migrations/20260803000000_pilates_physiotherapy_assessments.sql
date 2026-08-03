-- Digitalização fiel da Ficha de Avaliação Fisioterapêutica para o Pilates.
-- Dados cadastrais (nome, nascimento, sexo e telefone) permanecem em patients.

CREATE TABLE public.pilates_physiotherapy_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  physiotherapist_id uuid NOT NULL REFERENCES public.profiles(id),
  assessment_date date NOT NULL,
  naturalidade text,
  profissao text,
  diagnostico_clinico text,
  medico_responsavel text,
  telefone_medico text,
  pa text,
  fc text,
  peso text,
  altura text,
  queixa_principal text,
  observacoes text,
  mobilidade_coluna text,
  mobilidade_quadril text,
  mobilidade_ombro text,
  escoliose text,
  hiperlordose text,
  hipercifose text,
  contraturas_musculares_cicatrizes text,
  objetivo_melhora_postural boolean NOT NULL DEFAULT false,
  objetivo_alivio_stress boolean NOT NULL DEFAULT false,
  objetivo_alongamento boolean NOT NULL DEFAULT false,
  objetivo_alivio_dor boolean NOT NULL DEFAULT false,
  objetivo_melhora_condicionamento_fisico boolean NOT NULL DEFAULT false,
  objetivo_fortalecimento_muscular boolean NOT NULL DEFAULT false,
  objetivo_outros boolean NOT NULL DEFAULT false,
  diagnostico_fisioterapeutico text,
  objetivos_tratamento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pilates_postural_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.pilates_physiotherapy_assessments(id) ON DELETE CASCADE,
  vista text NOT NULL CHECK (vista IN ('Vista Anterior', 'Vista Lateral', 'Vista Posterior')),
  campo text NOT NULL,
  valor text NOT NULL,
  UNIQUE (assessment_id, vista, campo, valor)
);

CREATE TABLE public.pilates_functional_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.pilates_physiotherapy_assessments(id) ON DELETE CASCADE,
  numero smallint NOT NULL CHECK (numero BETWEEN 1 AND 10),
  observacoes text,
  UNIQUE (assessment_id, numero)
);

CREATE TABLE public.pilates_functional_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  functional_test_id uuid NOT NULL REFERENCES public.pilates_functional_tests(id) ON DELETE CASCADE,
  lado text CHECK (lado IN ('D', 'E')),
  percentual smallint NOT NULL CHECK (percentual IN (0, 4, 8, 10)),
  UNIQUE (functional_test_id, lado)
);

CREATE TABLE public.pilates_flexibility_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.pilates_physiotherapy_assessments(id) ON DELETE CASCADE,
  musculo text NOT NULL,
  direito text,
  esquerdo text,
  UNIQUE (assessment_id, musculo)
);

CREATE TABLE public.pilates_muscle_strength_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.pilates_physiotherapy_assessments(id) ON DELETE CASCADE,
  musculo text NOT NULL,
  direito text,
  esquerdo text,
  UNIQUE (assessment_id, musculo)
);

CREATE INDEX pilates_assessments_patient_date_idx
  ON public.pilates_physiotherapy_assessments (patient_id, assessment_date DESC);

ALTER TABLE public.pilates_physiotherapy_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilates_postural_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilates_functional_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilates_functional_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilates_flexibility_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilates_muscle_strength_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic users manage Pilates assessments" ON public.pilates_physiotherapy_assessments
  FOR ALL USING (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Clinic users manage Pilates postural findings" ON public.pilates_postural_findings
  FOR ALL USING (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments))
  WITH CHECK (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments));
CREATE POLICY "Clinic users manage Pilates functional tests" ON public.pilates_functional_tests
  FOR ALL USING (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments))
  WITH CHECK (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments));
CREATE POLICY "Clinic users manage Pilates functional results" ON public.pilates_functional_test_results
  FOR ALL USING (functional_test_id IN (SELECT id FROM public.pilates_functional_tests))
  WITH CHECK (functional_test_id IN (SELECT id FROM public.pilates_functional_tests));
CREATE POLICY "Clinic users manage Pilates flexibility" ON public.pilates_flexibility_measurements
  FOR ALL USING (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments))
  WITH CHECK (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments));
CREATE POLICY "Clinic users manage Pilates muscle strength" ON public.pilates_muscle_strength_measurements
  FOR ALL USING (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments))
  WITH CHECK (assessment_id IN (SELECT id FROM public.pilates_physiotherapy_assessments));

CREATE OR REPLACE FUNCTION public.set_pilates_assessment_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_pilates_assessment_updated_at
  BEFORE UPDATE ON public.pilates_physiotherapy_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_pilates_assessment_updated_at();