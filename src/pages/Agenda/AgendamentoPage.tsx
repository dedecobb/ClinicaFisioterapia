import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { messages } from "../../i18n";
import { NovoAgendamentoModal } from "./NovoAgendamentoModal";
import {
  atualizarAgendamento,
  atualizarStatusAgendamento,
  criarAgendamento,
  excluirAgendamento as excluirAgendamentoDb,
  getAgendamentosPorMes,
  getFisioterapeutas,
  getPacientes,
  SESSION_CAPACITY,
} from "./Agendamentoservice";
import {
  Agendamento,
  FiltrosAgendamento,
  Fisioterapeuta,
  NovoAgendamentoForm,
  Paciente,
  PatientProcedure,
  StatusAgendamento,
} from "./types";
import "./agendamento.css";

// ─── helpers ─────────────────────────────────────────────────────────────────

function hoje(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function diasNoMes(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function diaSemana(year: number, month: number, day: number): number {
  return new Date(year, month, day).getDay(); // 0 = dom
}

const MESES = messages.agenda.months;
const DIAS_SEMANA = messages.agenda.weekdays;
const STATUS_LABEL: Record<StatusAgendamento, string> = messages.agenda.status;

const STATUS_AGENDA: StatusAgendamento[] = [
  "agendada",
  "confirmada",
  "presenca_registrada",
  "ausencia_justificada",
  "falta",
  "reposicao",
  "cancelada",
];

function procedureQuantity(procedure: PatientProcedure) {
  return Number(procedure.quantity) || 1;
}

function formatProcedures(procedures: PatientProcedure[] | undefined): string {
  return (procedures ?? [])
    .map((procedure) => {
      const quantity = procedureQuantity(procedure);
      return `${procedure.name}${quantity > 1 ? ` (${quantity}x)` : ""}`;
    })
    .join(", ");
}

type ProcedureProgress = {
  label: string;
  done: number;
  total: number;
};

type SessionOccupancy = {
  horaInicio: string;
  horaFim: string;
  total: number;
};

function getMatchingProcedure(agendamento: Agendamento): PatientProcedure | undefined {
  return (agendamento.procedimentos ?? []).find(
    (procedure) => procedure.name === agendamento.tipoSessao,
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export const AgendamentoPage: React.FC = () => {
  const { profile } = useAuth();
  const canManageAgenda = profile?.role === "admin";
  const location = useLocation();
  const navigate = useNavigate();
  const dataHoje = hoje();
  const [anoInicial, mesInicial] = dataHoje.split("-").map(Number);
  const [ano, setAno] = useState(anoInicial);
  const [mes, setMes] = useState(mesInicial - 1);
  const [dataSelecionada, setDataSelecionada] = useState<string>(dataHoje);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [fisioterapeutas, setFisioterapeutas] = useState<Fisioterapeuta[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [pacienteInicialId, setPacienteInicialId] = useState<string | undefined>();
  const [agendamentoEditando, setAgendamentoEditando] =
    useState<Agendamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosAgendamento>({
    fisioterapeutaId: "todos",
    status: "todos",
    busca: "",
  });

  useEffect(() => {
    const state = location.state as
      | { openNew?: boolean; pacienteId?: string }
      | null;

    if (state?.openNew || state?.pacienteId) {
      setAgendamentoEditando(null);
      setPacienteInicialId(state.pacienteId);
      setModalAberto(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  // ── calendar logic ──────────────────────────────────────────────────────────

  const mesAnterior = () => {
    if (mes === 0) {
      setMes(11);
      setAno((y) => y - 1);
    } else setMes((m) => m - 1);
  };

  const proximoMes = () => {
    if (mes === 11) {
      setMes(0);
      setAno((y) => y + 1);
    } else setMes((m) => m + 1);
  };

  useEffect(() => {
    let ativo = true;

    async function carregarAgenda() {
      setCarregando(true);
      setErro(null);

      try {
        const [agenda, profissionais, listaPacientes] = await Promise.all([
          getAgendamentosPorMes(ano, mes),
          getFisioterapeutas(profile),
          getPacientes(profile),
        ]);

        if (!ativo) return;

        setAgendamentos(agenda);
        setFisioterapeutas(profissionais);
        setPacientes(listaPacientes);
      } catch (error) {
        if (!ativo) return;
        setErro(
          error instanceof Error
            ? error.message
            : "Erro ao carregar agendamentos.",
        );
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregarAgenda();

    return () => {
      ativo = false;
    };
  }, [ano, mes, profile]);

  const agendamentosPorData = useMemo(() => {
    const mapa: Record<string, Agendamento[]> = {};
    agendamentos.forEach((a) => {
      if (!mapa[a.data]) mapa[a.data] = [];
      mapa[a.data].push(a);
    });
    return mapa;
  }, [agendamentos]);

  const diasCalendario = useMemo(() => {
    const total = diasNoMes(ano, mes);
    const inicioSemana = diaSemana(ano, mes, 1);
    const dias: (number | null)[] = Array(inicioSemana).fill(null);
    for (let d = 1; d <= total; d++) dias.push(d);
    while (dias.length % 7 !== 0) dias.push(null);
    return dias;
  }, [ano, mes]);

  // ── appointments for selected day ───────────────────────────────────────────

  const agendamentosDia = useMemo(() => {
    let lista = agendamentos.filter((a) => a.data === dataSelecionada);

    if (filtros.fisioterapeutaId !== "todos")
      lista = lista.filter(
        (a) => a.fisioterapeutaId === filtros.fisioterapeutaId,
      );

    if (filtros.status !== "todos")
      lista = lista.filter((a) => a.status === filtros.status);

    if (filtros.busca.trim())
      lista = lista.filter(
        (a) =>
          a.paciente.nome.toLowerCase().includes(filtros.busca.toLowerCase()) ||
          a.tipoSessao.toLowerCase().includes(filtros.busca.toLowerCase()) ||
          formatProcedures(a.procedimentos)
            .toLowerCase()
            .includes(filtros.busca.toLowerCase()),
      );

    return lista.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }, [agendamentos, dataSelecionada, filtros]);

  const ocupacaoSessoesDia = useMemo(() => {
    const mapa = new Map<string, SessionOccupancy>();

    agendamentos
      .filter((a) => a.data === dataSelecionada && a.status !== "cancelada")
      .forEach((a) => {
        const atual = mapa.get(a.horaInicio);
        mapa.set(a.horaInicio, {
          horaInicio: a.horaInicio,
          horaFim: atual?.horaFim ?? a.horaFim,
          total: (atual?.total ?? 0) + 1,
        });
      });

    return Array.from(mapa.values()).sort((a, b) =>
      a.horaInicio.localeCompare(b.horaInicio),
    );
  }, [agendamentos, dataSelecionada]);

  const ocupacaoPorHorario = useMemo(() => {
    return ocupacaoSessoesDia.reduce<Record<string, SessionOccupancy>>(
      (mapa, ocupacao) => {
        mapa[ocupacao.horaInicio] = ocupacao;
        return mapa;
      },
      {},
    );
  }, [ocupacaoSessoesDia]);

  // ── totais do mês ───────────────────────────────────────────────────────────

  const totaisMes = useMemo(() => {
    const prefix = `${ano}-${String(mes + 1).padStart(2, "0")}`;
    const doMes = agendamentos.filter((a) => a.data.startsWith(prefix));
    return {
      total: doMes.length,
      confirmados: doMes.filter((a) => a.status === "confirmada").length,
      pendentes: doMes.filter((a) => a.status === "agendada").length,
      cancelados: doMes.filter((a) => a.status === "cancelada").length,
    };
  }, [agendamentos, ano, mes]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const abrirEditarModal = (a: Agendamento) => {
    setAgendamentoEditando(a);
    setPacienteInicialId(undefined);
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setAgendamentoEditando(null);
    setPacienteInicialId(undefined);
  };

  const salvarAgendamento = async (form: NovoAgendamentoForm) => {
    if (!profile?.clinic_id) {
      setErro("Não foi possível identificar a clínica do usuário.");
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      if (agendamentoEditando) {
        const atualizado = await atualizarAgendamento(
          agendamentoEditando.id,
          form,
        );

        setAgendamentos((prev) =>
          prev.map((a) => (a.id === atualizado.id ? atualizado : a)),
        );
      } else {
        const novo = await criarAgendamento(profile.clinic_id, form);
        setAgendamentos((prev) => [...prev, novo]);
        setDataSelecionada(form.data);
      }

      fecharModal();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar agendamento.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const excluirAgendamento = async (id: string) => {
    if (!window.confirm(messages.agenda.actions.confirmDelete)) return;

    setErro(null);

    try {
      await excluirAgendamentoDb(id);
      setAgendamentos((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao excluir agendamento.",
      );
    }
  };

  const alterarStatus = async (id: string, status: StatusAgendamento) => {
    setErro(null);

    try {
      const statusFinal = await atualizarStatusAgendamento(id, status);
      setAgendamentos((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: statusFinal } : a)),
      );
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao atualizar status.",
      );
    }
  };

  const getProcedureProgress = (
    agendamento: Agendamento,
  ): ProcedureProgress | undefined => {
    if (agendamento.pacoteId) return undefined;

    const procedure = getMatchingProcedure(agendamento);
    if (!procedure) return undefined;

    const procedureAppointments = agendamentos.filter((item) => {
      if (item.pacienteId !== agendamento.pacienteId || item.pacoteId) {
        return false;
      }

      const itemProcedure = getMatchingProcedure(item);
      return item.status !== "cancelada" && itemProcedure?.name === procedure.name;
    }).length;
    const done = agendamentos.filter((item) => {
      if (
        item.pacienteId !== agendamento.pacienteId ||
        item.pacoteId ||
        item.status !== "presenca_registrada"
      ) {
        return false;
      }

      const itemProcedure = getMatchingProcedure(item);
      return itemProcedure?.name === procedure.name;
    }).length;

    return {
      label: procedure.name,
      done,
      total: Math.max(procedureQuantity(procedure), procedureAppointments),
    };
  };

  // ── render ──────────────────────────────────────────────────────────────────

  const dataSel = new Date(dataSelecionada + "T12:00:00");
  const dataSelFormatada = dataSel.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="agendamento-page">
      {/* ── Cabeçalho ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Agendamentos</h1>
          <p className="page-subtitle">
            Gerencie aulas, procedimentos, presenças, faltas e reposições
          </p>
        </div>
        {canManageAgenda && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setAgendamentoEditando(null);
              setPacienteInicialId(undefined);
              setModalAberto(true);
            }}
          >
            {messages.agenda.actions.newAppointment}
          </button>
        )}
      </div>

      {erro && <div className="card error-card">{erro}</div>}

      {/* ── Cards de Resumo ── */}
      <div className="resumo-grid">
        <div className="resumo-card">
          <span className="resumo-label">Total no mês</span>
          <span className="resumo-valor">{totaisMes.total}</span>
        </div>
        <div className="resumo-card resumo-confirmado">
          <span className="resumo-label">Confirmados</span>
          <span className="resumo-valor">{totaisMes.confirmados}</span>
        </div>
        <div className="resumo-card resumo-pendente">
          <span className="resumo-label">Agendadas</span>
          <span className="resumo-valor">{totaisMes.pendentes}</span>
        </div>
        <div className="resumo-card resumo-cancelado">
          <span className="resumo-label">Canceladas</span>
          <span className="resumo-valor">{totaisMes.cancelados}</span>
        </div>
      </div>

      <div className="content-grid">
        {/* ── Calendário ── */}
        <div className="card calendario-card">
          <div className="cal-header">
            <button
              className="cal-nav-btn"
              onClick={mesAnterior}
              aria-label={messages.agenda.actions.previousMonth}
              translate="no"
            >
              ‹
            </button>
            <span className="cal-titulo">
              {MESES[mes]} {ano}
            </span>
            <button
              className="cal-nav-btn"
              onClick={proximoMes}
              aria-label={messages.agenda.actions.nextMonth}
              translate="no"
            >
              ›
            </button>
          </div>

          <div className="cal-grid">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="cal-dia-semana">
                {d}
              </div>
            ))}
            {diasCalendario.map((dia, i) => {
              if (dia === null) return <div key={`vazio-${i}`} />;
              const dataStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
              const ags = agendamentosPorData[dataStr] ?? [];
              const isHoje = dataStr === hoje();
              const isSelecionado = dataStr === dataSelecionada;
              const temConfirmado = ags.some((a) => a.status === "confirmada");
              const temPendente = ags.some((a) => a.status === "agendada");

              return (
                <button
                  key={dia}
                  className={`cal-dia ${isHoje ? "cal-dia-hoje" : ""} ${isSelecionado ? "cal-dia-selecionado" : ""}`}
                  onClick={() => setDataSelecionada(dataStr)}
                >
                  <span className="cal-dia-num">{dia}</span>
                  {ags.length > 0 && (
                    <div className="cal-dots">
                      {temConfirmado && <span className="dot dot-confirmado" />}
                      {temPendente && <span className="dot dot-pendente" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legenda fisioterapeutas */}
          <div className="legenda">
            {fisioterapeutas.map((f) => (
              <div key={f.id} className="legenda-item">
                <span
                  className="legenda-dot"
                  style={{ backgroundColor: f.cor }}
                />
                <span className="legenda-nome">
                  {f.nome.replace("Dr", "Dr.")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Lista do Dia ── */}
        <div className="lista-dia-wrapper">
          {/* Filtros */}
          <div className="card filtros-card">
            <input
              type="text"
              className="filtro-busca"
              placeholder={messages.agenda.filters.searchPlaceholder}
              translate="no"
              value={filtros.busca}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, busca: e.target.value }))
              }
            />
            <div className="filtros-selects">
              <select
                className="filtro-select"
                value={filtros.fisioterapeutaId}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    fisioterapeutaId: e.target.value,
                  }))
                }
              >
                <option value="todos">{messages.agenda.filters.allPhysios}</option>
                {fisioterapeutas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
              <select
                className="filtro-select"
                value={filtros.status}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    status: e.target.value as StatusAgendamento | "todos",
                  }))
                }
              >
                <option value="todos">{messages.agenda.filters.allStatuses}</option>
                {STATUS_AGENDA.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cabeçalho do dia */}
          <div className="dia-header">
            <h2 className="dia-titulo">{dataSelFormatada}</h2>
            <span className="dia-contador">
              {agendamentosDia.length} atendimento
              {agendamentosDia.length !== 1 ? "s" : ""}
            </span>
          </div>

          {ocupacaoSessoesDia.length > 0 && (
            <div className="session-capacity-panel">
              <span className="session-capacity-title">Lotação por sessão</span>
              <div className="session-capacity-list">
                {ocupacaoSessoesDia.map((ocupacao) => {
                  const lotada = ocupacao.total >= SESSION_CAPACITY;

                  return (
                    <span
                      key={ocupacao.horaInicio}
                      className={`session-capacity-chip ${
                        lotada ? "session-capacity-full" : ""
                      }`}
                    >
                      {ocupacao.horaInicio}-{ocupacao.horaFim}:{" "}
                      {ocupacao.total}/{SESSION_CAPACITY}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cards dos agendamentos */}
          {carregando ? (
            <div className="empty-state">
              <p className="empty-title">Carregando agenda...</p>
            </div>
          ) : agendamentosDia.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <p className="empty-title">Nenhum atendimento neste dia</p>
              <p className="empty-sub">
                Os atendimentos aparecem após cadastrar pacotes, procedimentos
                ou criar um agendamento.
              </p>
            </div>
          ) : (
            <div className="agendamentos-lista">
              {agendamentosDia.map((ag) => (
                <AgendamentoCard
                  key={ag.id}
                  agendamento={ag}
                  fisioterapeutas={fisioterapeutas}
                  canManage={canManageAgenda}
                  procedureProgress={getProcedureProgress(ag)}
                  sessionOccupancy={ocupacaoPorHorario[ag.horaInicio]}
                  onEditar={() => abrirEditarModal(ag)}
                  onExcluir={() => excluirAgendamento(ag.id)}
                  onAlterarStatus={(status) => alterarStatus(ag.id, status)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <NovoAgendamentoModal
        aberto={modalAberto}
        agendamento={agendamentoEditando}
        pacientes={pacientes}
        fisioterapeutas={fisioterapeutas}
        dataInicial={dataSelecionada}
        pacienteInicialId={pacienteInicialId}
        onFechar={fecharModal}
        onSalvar={salvarAgendamento}
        salvando={salvando}
      />
    </div>
  );
};

// ─── AgendamentoCard ─────────────────────────────────────────────────────────

interface CardProps {
  agendamento: Agendamento;
  fisioterapeutas: Fisioterapeuta[];
  canManage: boolean;
  procedureProgress?: ProcedureProgress;
  sessionOccupancy?: SessionOccupancy;
  onEditar: () => void;
  onExcluir: () => void;
  onAlterarStatus: (status: StatusAgendamento) => void;
}

const AgendamentoCard: React.FC<CardProps> = ({
  agendamento: ag,
  fisioterapeutas,
  canManage,
  procedureProgress,
  sessionOccupancy,
  onEditar,
  onExcluir,
  onAlterarStatus,
}) => {
  const procedimentos = formatProcedures(ag.procedimentos);
  const fisioterapeutaCor =
    fisioterapeutas.find((f) => f.id === ag.fisioterapeutaId)?.cor ??
    ag.fisioterapeuta.cor;

  return (
    <div className={`ag-card ag-card-${ag.status}`}>
      {/* Barra lateral colorida */}
      <div
        className="ag-barra"
        style={{ backgroundColor: fisioterapeutaCor }}
      />

      <div className="ag-content">
        {/* Linha 1: Hora + Status */}
        <div className="ag-row-top">
          <span className="ag-hora">
            {ag.horaInicio} – {ag.horaFim}
          </span>
          <div className="ag-badge-group">
            {sessionOccupancy && (
              <span
                className={`badge badge-capacidade ${
                  sessionOccupancy.total >= SESSION_CAPACITY
                    ? "badge-capacidade-full"
                    : ""
                }`}
              >
                {sessionOccupancy.total}/{SESSION_CAPACITY}
              </span>
            )}
            <span
              className={`notranslate badge badge-${ag.status}`}
              translate="no"
            >
              {STATUS_LABEL[ag.status]}
            </span>
          </div>
        </div>

        {/* Linha 2: Paciente */}
        <div className="ag-paciente">{ag.paciente.nome}</div>

        {/* Linha 3: Tipo + Fisioterapeuta */}
        <div className="ag-row-info">
          <span className="ag-tipo">{ag.tipoSessao}</span>
          {ag.sessaoNumero && ag.totalSessoes && (
            <span className="ag-sessao">
              {ag.sessaoNumero}/{ag.totalSessoes}
            </span>
          )}
        </div>
        <div className="ag-fisio" style={{ color: fisioterapeutaCor }}>
          {ag.fisioterapeuta.nome}
        </div>

        {procedimentos && (
          <div className="ag-procedimentos">
            <span>Procedimentos</span>
            {procedimentos}
          </div>
        )}

        {procedureProgress && (
          <div className="ag-procedimentos">
            <span>Controle</span>
            {procedureProgress.label}: {procedureProgress.done}/
            {procedureProgress.total} realizados
          </div>
        )}

        {/* Convênio */}
        {ag.paciente.convenio && (
          <div className="ag-convenio">{ag.paciente.convenio}</div>
        )}

        {/* Observações */}
        {ag.observacoes && <div className="ag-obs">{ag.observacoes}</div>}

        {canManage && (
          <div className="ag-acoes">
            {procedureProgress && ag.status !== "presenca_registrada" && (
              <button
                className="btn-status btn-status-presenca_registrada"
                onClick={() => onAlterarStatus("presenca_registrada")}
                title={messages.agenda.actions.confirmDone}
                translate="no"
              >
                {messages.agenda.actions.confirmDone}
              </button>
            )}
            <div className="ag-status-group">
              {STATUS_AGENDA.map((s) => (
                <button
                  key={s}
                  className={`btn-status btn-status-${s} ${ag.status === s ? "ativo" : ""}`}
                  onClick={() => onAlterarStatus(s)}
                  title={STATUS_LABEL[s]}
                  translate="no"
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="ag-btn-group">
              <button className="btn-icone" onClick={onEditar} title={messages.agenda.actions.edit} translate="no">
                ✏️
              </button>
              <button
                className="btn-icone btn-excluir"
                onClick={onExcluir}
                title={messages.agenda.actions.delete}
                translate="no"
              >
                🗑️
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
