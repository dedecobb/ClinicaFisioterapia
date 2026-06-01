import { supabase } from "../lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Evolution {
  id: string;
  patient_id: string;
  professional_id: string | null;
  appointment_id: string | null;
  content: string;
  attachments: string[] | null;
  created_at: string;
  profiles?: { id: string; full_name: string; avatar_url?: string } | null;
  appointments?: { id: string } | null;
}

export interface PatientProcedure {
  type: string;
  name: string;
  agreed_value: number | string;
  quantity?: number | string | null;
}

export interface PatientLessonPackage {
  id: string;
  status: string | null;
  start_date: string;
  procedure_credits?: PatientProcedure[] | null;
}

export interface Patient {
  id: string;
  clinic_id?: string | null;
  full_name: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  address?: string | null;
  clinical_notes?: string | null;
  status?: string | null;
  procedures?: PatientProcedure[] | null;
  responsible_professional_id?: string | null;
  lesson_packages?: PatientLessonPackage[] | null;
  created_at?: string;
}

export interface Profile {
  id: string;
  clinic_id?: string | null;
  full_name: string;
  role?: string | null;
  avatar_url?: string | null;
  updated_at?: string;
}

export interface PatientAppointment {
  id: string;
  patient_id: string;
  professional_id: string | null;
  package_id: string | null;
  package_lesson_number: number | null;
  start_time: string;
  end_time: string;
  type: string;
  status: string;
  notes: string | null;
  class_price: number | string | null;
  profiles?: { id: string; full_name: string } | null;
  lesson_packages?: {
    id: string;
    total_lessons: number;
    procedure_credits?: PatientProcedure[] | null;
  } | null;
}

export interface CreateEvolutionPayload {
  patient_id: string;
  professional_id?: string | null;
  appointment_id?: string | null;
  content: string;
  attachments?: string[] | null;
}

// Representa um arquivo anexado a uma evolução (para a aba Documentos)
export interface Documento {
  url: string;
  nome: string;
  evolutionId: string;
  evolutionDate: string;
  profissional: string;
}

// ── Utilitários de Data ───────────────────────────────────────────────────────
//
// ⚠️  IMPORTANTE: new Date("2001-07-27") interpreta a string como UTC meia-noite.
// No fuso do Brasil (UTC-3), isso vira "2001-07-26 21:00" — um dia a menos.
// Solução: parsear a data adicionando hora do meio-dia para neutralizar o offset.

export function parseDateSafe(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  // "2001-07-27" → "2001-07-27T12:00:00" (meio-dia, sem risco de virar dia anterior)
  return new Date(`${dateStr}T12:00:00`);
}

export function formatarDataNascimento(
  dateStr: string | null | undefined,
): string {
  const d = parseDateSafe(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function calcularIdade(
  birthDate: string | null | undefined,
): number | null {
  const d = parseDateSafe(birthDate);
  if (!d) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) idade--;
  return idade;
}

function mergeProcedures(
  ...procedureLists: Array<PatientProcedure[] | null | undefined>
): PatientProcedure[] {
  const byType = new Map<string, PatientProcedure>();

  procedureLists.flatMap((list) => list ?? []).forEach((procedure) => {
    if (!procedure.name?.trim()) return;
    byType.set(procedure.type, procedure);
  });

  return Array.from(byType.values());
}

export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nomeArquivoDeUrl(url: string): string {
  try {
    const partes = new URL(url).pathname.split("/");
    const nome = partes[partes.length - 1];
    // Remove o prefixo de timestamp gerado no upload: "1234567890_exame.pdf" → "exame.pdf"
    return decodeURIComponent(nome.replace(/^\d+_/, ""));
  } catch {
    return url;
  }
}

export function extensaoArquivo(url: string): string {
  return nomeArquivoDeUrl(url).split(".").pop()?.toLowerCase() ?? "";
}

// ── Paciente ──────────────────────────────────────────────────────────────────

export async function getPatientById(
  patientId: string,
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select(
      `
      *,
      lesson_packages (
        id,
        status,
        start_date,
        procedure_credits
      )
    `,
    )
    .eq("id", patientId)
    .single();

  if (error) {
    console.error("Erro ao buscar paciente:", error.message);
    return null;
  }

  const patient = data as Patient;
  const currentPackage = [...(patient.lesson_packages ?? [])].sort((a, b) => {
    if (a.status === "ativo" && b.status !== "ativo") return -1;
    if (a.status !== "ativo" && b.status === "ativo") return 1;
    return b.start_date.localeCompare(a.start_date);
  })[0];
  const packageProcedures = currentPackage?.procedure_credits ?? [];
  const procedures = mergeProcedures(patient.procedures, packageProcedures);

  return {
    ...patient,
    procedures: procedures.length > 0 ? procedures : patient.procedures,
  };
}

// ── Evoluções ─────────────────────────────────────────────────────────────────

const EVOLUTION_SELECT = `
  *,
  profiles ( id, full_name, avatar_url ),
  appointments ( id )
`;

export async function getEvolutionsByPatient(
  patientId: string,
): Promise<Evolution[]> {
  const { data, error } = await supabase
    .from("evolutions")
    .select(EVOLUTION_SELECT)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Erro ao buscar evoluções: ${error.message}`);
  return (data ?? []) as Evolution[];
}

export async function createEvolution(
  payload: CreateEvolutionPayload,
): Promise<Evolution> {
  const { data, error } = await supabase
    .from("evolutions")
    .insert(payload)
    .select(EVOLUTION_SELECT)
    .single();

  if (error) throw new Error(`Erro ao criar evolução: ${error.message}`);
  return data as Evolution;
}

export async function updateEvolution(
  id: string,
  content: string,
): Promise<Evolution> {
  const { data, error } = await supabase
    .from("evolutions")
    .update({ content })
    .eq("id", id)
    .select(EVOLUTION_SELECT)
    .single();

  if (error) throw new Error(`Erro ao atualizar evolução: ${error.message}`);
  return data as Evolution;
}

export async function deleteEvolution(id: string): Promise<void> {
  const { error } = await supabase.from("evolutions").delete().eq("id", id);
  if (error) throw new Error(`Erro ao excluir evolução: ${error.message}`);
}

// Adiciona URLs de anexos a uma evolução existente
export async function addAttachmentsToEvolution(
  evolutionId: string,
  newUrls: string[],
  currentAttachments: string[] | null,
): Promise<Evolution> {
  const merged = [...(currentAttachments ?? []), ...newUrls];
  const { data, error } = await supabase
    .from("evolutions")
    .update({ attachments: merged })
    .eq("id", evolutionId)
    .select(EVOLUTION_SELECT)
    .single();

  if (error) throw new Error(`Erro ao atualizar anexos: ${error.message}`);
  return data as Evolution;
}

// ── Upload de arquivos (Supabase Storage) ─────────────────────────────────────
//
// Crie o bucket "patient-files" no Supabase Dashboard → Storage
// Defina como público (ou gere URLs assinadas para conteúdo privado)

const BUCKET = "patient-files";

export async function uploadExame(
  patientId: string,
  file: File,
): Promise<string> {
  const path = `${patientId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteExame(url: string): Promise<void> {
  // Extrai o path relativo a partir da URL pública
  const match = url.match(/patient-files\/(.+)$/);
  if (!match) return;
  const path = match[1];
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Erro ao excluir arquivo: ${error.message}`);
}

// ── Documentos agregados ──────────────────────────────────────────────────────
// Consolida todos os anexos de todas as evoluções do paciente

export function extrairDocumentos(evolutions: Evolution[]): Documento[] {
  const docs: Documento[] = [];
  for (const ev of evolutions) {
    if (!ev.attachments?.length) continue;
    for (const url of ev.attachments) {
      docs.push({
        url,
        nome: nomeArquivoDeUrl(url),
        evolutionId: ev.id,
        evolutionDate: ev.created_at,
        profissional: ev.profiles?.full_name ?? "Profissional",
      });
    }
  }
  return docs;
}

// ── Profissionais ─────────────────────────────────────────────────────────────

export async function getProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .order("full_name");

  if (error) throw new Error(`Erro ao buscar profissionais: ${error.message}`);
  return (data ?? []) as Profile[];
}

export async function getAppointmentsByPatient(
  patientId: string,
): Promise<PatientAppointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      patient_id,
      professional_id,
      package_id,
      package_lesson_number,
      start_time,
      end_time,
      type,
      status,
      notes,
      class_price,
      profiles (id, full_name),
      lesson_packages (id, total_lessons, procedure_credits)
    `,
    )
    .eq("patient_id", patientId)
    .order("start_time", { ascending: false });

  if (error) throw new Error(`Erro ao buscar agenda do paciente: ${error.message}`);
  return (data ?? []) as unknown as PatientAppointment[];
}
