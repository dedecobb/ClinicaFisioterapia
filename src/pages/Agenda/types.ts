export type StatusAgendamento =
  | "agendada"
  | "confirmada"
  | "presenca_registrada"
  | "ausencia_justificada"
  | "falta"
  | "reposicao"
  | "cancelada";

export type TipoSessao =
  | "Avaliação Inicial"
  | "Fisioterapia Ortopédica"
  | "Fisioterapia Neurológica"
  | "Fisioterapia Respiratória"
  | "Pilates Clínico"
  | "RPG"
  | "Drenagem linfática"
  | "Liberação miofascial"
  | "Massagem relaxante"
  | "Fisioterapia"
  | "Fisioterapia pélvica"
  | "Procedimentos combinados"
  | "Acupuntura"
  | "Hidroterapia";

export interface Paciente {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  convenio?: string;
  procedimentos?: {
    type: string;
    name: string;
    agreedValue: number;
  }[];
  pacoteAtivo?: {
    id: string;
    professionalId: string | null;
    totalAulas: number;
    aulasRealizadas: number;
    aulasFaltadas: number;
    ausenciasJustificadas: number;
    valorAula: number;
    diasFixos: number[];
    horarioFixo: string;
    duracaoMinutos: number;
    statusPagamento: string;
  };
}

export interface Fisioterapeuta {
  id: string;
  nome: string;
  especialidade: string;
  cor: string; // hex color for calendar identification
}

export interface Agendamento {
  id: string;
  pacienteId: string;
  paciente: Paciente;
  fisioterapeutaId: string;
  fisioterapeuta: Fisioterapeuta;
  data: string; // ISO date string YYYY-MM-DD
  horaInicio: string; // HH:mm
  horaFim: string; // HH:mm
  tipoSessao: TipoSessao;
  status: StatusAgendamento;
  observacoes?: string;
  sessaoNumero?: number;
  totalSessoes?: number;
  pacoteId?: string;
  valorAula?: number;
}

export interface FiltrosAgendamento {
  fisioterapeutaId: string | "todos";
  status: StatusAgendamento | "todos";
  busca: string;
}

export interface NovoAgendamentoForm {
  pacienteId: string;
  fisioterapeutaId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  tipoSessao: TipoSessao;
  status: StatusAgendamento;
  observacoes: string;
  sessaoNumero: number;
  totalSessoes: number;
  pacoteId?: string;
  valorAula?: number;
}
