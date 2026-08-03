import { supabase } from "../lib/supabase";

export type PilatesAssessmentForm = {
  assessment_date: string;
  physiotherapist_id: string;
  naturalidade: string;
  profissao: string;
  diagnostico_clinico: string;
  medico_responsavel: string;
  telefone_medico: string;
  pa: string;
  fc: string;
  peso: string;
  altura: string;
  queixa_principal: string;
  observacoes: string;
  mobilidade_coluna: string;
  mobilidade_quadril: string;
  mobilidade_ombro: string;
  escoliose: string;
  hiperlordose: string;
  hipercifose: string;
  contraturas_musculares_cicatrizes: string;
  objetivo_melhora_postural: boolean;
  objetivo_alivio_stress: boolean;
  objetivo_alongamento: boolean;
  objetivo_alivio_dor: boolean;
  objetivo_melhora_condicionamento_fisico: boolean;
  objetivo_fortalecimento_muscular: boolean;
  objetivo_outros: boolean;
  diagnostico_fisioterapeutico: string;
  objetivos_tratamento: string;
  postural_findings: PosturalFinding[];
  functional_tests: FunctionalTest[];
  flexibility: Measurement[];
  muscle_strength: Measurement[];
};

export type PosturalFinding = { vista: string; campo: string; valor: string };
export type FunctionalTest = {
  numero: number;
  observacoes: string;
  resultados: Array<{ lado: "D" | "E" | null; percentual: number }>;
};
export type Measurement = { musculo: string; direito: string; esquerdo: string };

export type PilatesAssessmentSummary = Pick<
  PilatesAssessmentForm,
  "assessment_date" | "physiotherapist_id"
> & {
  id: string;
  patient_id: string;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string } | null;
};

export type PilatesAssessment = PilatesAssessmentSummary & PilatesAssessmentForm;

const ASSESSMENT_COLUMNS = `
  id, patient_id, physiotherapist_id, assessment_date, created_at, updated_at,
  naturalidade, profissao, diagnostico_clinico, medico_responsavel, telefone_medico,
  pa, fc, peso, altura, queixa_principal, observacoes, mobilidade_coluna,
  mobilidade_quadril, mobilidade_ombro, escoliose, hiperlordose, hipercifose,
  contraturas_musculares_cicatrizes, objetivo_melhora_postural, objetivo_alivio_stress,
  objetivo_alongamento, objetivo_alivio_dor, objetivo_melhora_condicionamento_fisico,
  objetivo_fortalecimento_muscular, objetivo_outros, diagnostico_fisioterapeutico,
  objetivos_tratamento, profiles!pilates_physiotherapy_assessments_physiotherapist_id_fkey(full_name)
`;

const childTables = [
  "pilates_postural_findings",
  "pilates_flexibility_measurements",
  "pilates_muscle_strength_measurements",
] as const;

function stripRelations(form: PilatesAssessmentForm) {
  const { postural_findings, functional_tests, flexibility, muscle_strength, ...row } = form;
  return row;
}

async function replaceRelations(assessmentId: string, form: PilatesAssessmentForm) {
  const { data: existingTests, error: existingTestsError } = await supabase
    .from("pilates_functional_tests")
    .select("id")
    .eq("assessment_id", assessmentId);
  if (existingTestsError) throw new Error(existingTestsError.message);
  const testIds = (existingTests ?? []).map((test) => test.id);
  if (testIds.length) {
    const { error } = await supabase
      .from("pilates_functional_test_results")
      .delete()
      .in("functional_test_id", testIds);
    if (error) throw new Error(error.message);
  }
  const { error: deleteTestsError } = await supabase
    .from("pilates_functional_tests")
    .delete()
    .eq("assessment_id", assessmentId);
  if (deleteTestsError) throw new Error(deleteTestsError.message);

  for (const table of childTables) {
    const { error } = await supabase.from(table).delete().eq("assessment_id", assessmentId);
    if (error) throw new Error(error.message);
  }

  if (form.postural_findings.length) {
    const { error } = await supabase.from("pilates_postural_findings").insert(
      form.postural_findings.map((item) => ({ ...item, assessment_id: assessmentId })),
    );
    if (error) throw new Error(error.message);
  }

  const measurements = [
    ["pilates_flexibility_measurements", form.flexibility],
    ["pilates_muscle_strength_measurements", form.muscle_strength],
  ] as const;
  for (const [table, values] of measurements) {
    const { error } = await supabase.from(table).insert(
      values.map((item) => ({ ...item, assessment_id: assessmentId })),
    );
    if (error) throw new Error(error.message);
  }

  for (const test of form.functional_tests) {
    const { data: createdTest, error } = await supabase
      .from("pilates_functional_tests")
      .insert({ assessment_id: assessmentId, numero: test.numero, observacoes: test.observacoes || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (test.resultados.length) {
      const { error: resultError } = await supabase.from("pilates_functional_test_results").insert(
        test.resultados.map((result) => ({ ...result, functional_test_id: createdTest.id })),
      );
      if (resultError) throw new Error(resultError.message);
    }
  }
}

export async function listPilatesAssessments(patientId: string): Promise<PilatesAssessmentSummary[]> {
  const { data, error } = await supabase
    .from("pilates_physiotherapy_assessments")
    .select(`id, patient_id, physiotherapist_id, assessment_date, created_at, updated_at, profiles!pilates_physiotherapy_assessments_physiotherapist_id_fkey(full_name)`)
    .eq("patient_id", patientId)
    .order("assessment_date", { ascending: false });
  if (error) throw new Error(`Erro ao buscar avaliações: ${error.message}`);
  return (data ?? []) as PilatesAssessmentSummary[];
}

export async function getPilatesAssessment(id: string): Promise<PilatesAssessment> {
  const { data: assessment, error } = await supabase
    .from("pilates_physiotherapy_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw new Error(`Erro ao buscar avaliação: ${error.message}`);

  const [postural, tests, flexibility, strength] = await Promise.all([
    supabase.from("pilates_postural_findings").select("vista, campo, valor").eq("assessment_id", id),
    supabase.from("pilates_functional_tests").select("id, numero, observacoes, pilates_functional_test_results(lado, percentual)").eq("assessment_id", id).order("numero"),
    supabase.from("pilates_flexibility_measurements").select("musculo, direito, esquerdo").eq("assessment_id", id),
    supabase.from("pilates_muscle_strength_measurements").select("musculo, direito, esquerdo").eq("assessment_id", id),
  ]);
  for (const result of [postural, tests, flexibility, strength]) if (result.error) throw new Error(result.error.message);
  return {
    ...(assessment as Omit<PilatesAssessment, "postural_findings" | "functional_tests" | "flexibility" | "muscle_strength">),
    postural_findings: (postural.data ?? []) as PosturalFinding[],
    functional_tests: (tests.data ?? []).map((test) => ({
      numero: test.numero,
      observacoes: test.observacoes ?? "",
      resultados: (test.pilates_functional_test_results ?? []) as FunctionalTest["resultados"],
    })),
    flexibility: (flexibility.data ?? []) as Measurement[],
    muscle_strength: (strength.data ?? []) as Measurement[],
  };
}

export async function createPilatesAssessment(
  patientId: string,
  clinicId: string,
  form: PilatesAssessmentForm,
): Promise<PilatesAssessmentSummary> {
  const { data, error } = await supabase
    .from("pilates_physiotherapy_assessments")
    .insert({ ...stripRelations(form), patient_id: patientId, clinic_id: clinicId })
    .select(ASSESSMENT_COLUMNS)
    .single();
  if (error) throw new Error(`Erro ao criar avaliação: ${error.message}`);
  await replaceRelations(data.id, form);
  return data as PilatesAssessmentSummary;
}

export async function updatePilatesAssessment(id: string, form: PilatesAssessmentForm): Promise<void> {
  const { error } = await supabase.from("pilates_physiotherapy_assessments").update(stripRelations(form)).eq("id", id);
  if (error) throw new Error(`Erro ao atualizar avaliação: ${error.message}`);
  await replaceRelations(id, form);
}

export async function deletePilatesAssessment(id: string): Promise<void> {
  const { error } = await supabase.from("pilates_physiotherapy_assessments").delete().eq("id", id);
  if (error) throw new Error(`Erro ao excluir avaliação: ${error.message}`);
}
