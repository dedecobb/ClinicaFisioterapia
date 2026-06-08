export const ptBR = {
  app: {
    brandName: "Biofisio",
  },
  nav: {
    dashboard: "Dashboard",
    agenda: "Agenda",
    patients: "Pacientes",
    certificates: "Atestados",
    financial: "Financeiro",
    invoices: "Notas Fiscais",
    whatsapp: "WhatsApp",
    team: "Equipe",
    logout: "Sair",
  },
  agenda: {
    months: [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ],
    weekdays: [
      "Domingo",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ],
    status: {
      agendada: "Agendada",
      confirmada: "Confirmada",
      presenca_registrada: "Presença",
      ausencia_justificada: "Ausência justificada",
      falta: "Falta",
      reposicao: "Reposição",
      cancelada: "Cancelada",
    },
    filters: {
      allPhysios: "Todos os fisioterapeutas",
      allStatuses: "Todos os status",
      searchPlaceholder: "Buscar paciente ou tipo de sessão...",
    },
    actions: {
      newAppointment: "Novo atendimento",
      previousMonth: "Mês anterior",
      nextMonth: "Próximo mês",
      confirmDelete: "Deseja excluir este agendamento?",
      confirmDone: "Confirmar realizado",
      edit: "Editar",
      delete: "Excluir",
    },
  },
  team: {
    roles: {
      admin: "Admin",
      physio: "Fisioterapeuta",
    },
    invitationStatus: {
      accepted: "Aceito",
      pending: "Pendente",
    },
  },
  clinicalHub: {
    quickActions: {
      addExam: "Adicionar Exame",
      viewDocuments: "Ver Documentos",
      newEvolution: "Nova Evolução",
    },
    evolutionPlaceholder:
      "Descreva o atendimento, condutas realizadas e observações clínicas...",
  },
} as const;
