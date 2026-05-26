export type StatusAgendamento =
  | "confirmado"
  | "pendente"
  | "cancelado"
  | "concluido";

export type TipoSessao =
  | "Avaliação Inicial"
  | "Fisioterapia Ortopédica"
  | "Fisioterapia Neurológica"
  | "Fisioterapia Respiratória"
  | "Pilates Clínico"
  | "RPG"
  | "Acupuntura"
  | "Hidroterapia";

export interface Paciente {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  convenio?: string;
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
}
