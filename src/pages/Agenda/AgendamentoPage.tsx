import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { NovoAgendamentoModal } from "./NovoAgendamentoModal";
import {
  atualizarAgendamento,
  atualizarStatusAgendamento,
  criarAgendamento,
  excluirAgendamento as excluirAgendamentoDb,
  getAgendamentosPorMes,
  getFisioterapeutas,
  getPacientes,
} from "./Agendamentoservice";
import {
  Agendamento,
  FiltrosAgendamento,
  Fisioterapeuta,
  NovoAgendamentoForm,
  Paciente,
  StatusAgendamento,
} from "./types";
import "./agendamento.css";

// ─── helpers ─────────────────────────────────────────────────────────────────

function hoje(): string {
  return new Date().toISOString().split("T")[0];
}

function diasNoMes(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function diaSemana(year: number, month: number, day: number): number {
  return new Date(year, month, day).getDay(); // 0 = dom
}

const MESES = [
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
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_LABEL: Record<StatusAgendamento, string> = {
  confirmado: "Confirmado",
  pendente: "Pendente",
  cancelado: "Cancelado",
  concluido: "Concluído",
};

// ─── component ────────────────────────────────────────────────────────────────

export const AgendamentoPage: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());
  const [dataSelecionada, setDataSelecionada] = useState<string>(hoje());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [fisioterapeutas, setFisioterapeutas] = useState<Fisioterapeuta[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
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
    if ((location.state as { openNew?: boolean } | null)?.openNew) {
      setAgendamentoEditando(null);
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
          getFisioterapeutas(),
          getPacientes(),
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
  }, [ano, mes]);

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
          a.tipoSessao.toLowerCase().includes(filtros.busca.toLowerCase()),
      );

    return lista.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }, [agendamentos, dataSelecionada, filtros]);

  // ── totais do mês ───────────────────────────────────────────────────────────

  const totaisMes = useMemo(() => {
    const prefix = `${ano}-${String(mes + 1).padStart(2, "0")}`;
    const doMes = agendamentos.filter((a) => a.data.startsWith(prefix));
    return {
      total: doMes.length,
      confirmados: doMes.filter((a) => a.status === "confirmado").length,
      pendentes: doMes.filter((a) => a.status === "pendente").length,
      cancelados: doMes.filter((a) => a.status === "cancelado").length,
    };
  }, [agendamentos, ano, mes]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const abrirNovoModal = () => {
    setAgendamentoEditando(null);
    setModalAberto(true);
  };

  const abrirEditarModal = (a: Agendamento) => {
    setAgendamentoEditando(a);
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setAgendamentoEditando(null);
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
    if (!window.confirm("Deseja excluir este agendamento?")) return;

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
      await atualizarStatusAgendamento(id, status);
      setAgendamentos((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a)),
      );
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao atualizar status.",
      );
    }
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
          <p className="page-subtitle">Gerencie as consultas da clínica</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={abrirNovoModal}>
          <span className="btn-icon">+</span>
          Novo Agendamento
        </button>
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
          <span className="resumo-label">Pendentes</span>
          <span className="resumo-valor">{totaisMes.pendentes}</span>
        </div>
        <div className="resumo-card resumo-cancelado">
          <span className="resumo-label">Cancelados</span>
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
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <span className="cal-titulo">
              {MESES[mes]} {ano}
            </span>
            <button
              className="cal-nav-btn"
              onClick={proximoMes}
              aria-label="Próximo mês"
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
              const temConfirmado = ags.some((a) => a.status === "confirmado");
              const temPendente = ags.some((a) => a.status === "pendente");

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
              placeholder="Buscar paciente ou tipo de sessão..."
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
                <option value="todos">Todos os fisioterapeutas</option>
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
                <option value="todos">Todos os status</option>
                <option value="confirmado">Confirmado</option>
                <option value="pendente">Pendente</option>
                <option value="cancelado">Cancelado</option>
                <option value="concluido">Concluído</option>
              </select>
            </div>
          </div>

          {/* Cabeçalho do dia */}
          <div className="dia-header">
            <h2 className="dia-titulo">{dataSelFormatada}</h2>
            <span className="dia-contador">
              {agendamentosDia.length} consulta
              {agendamentosDia.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Cards dos agendamentos */}
          {carregando ? (
            <div className="empty-state">
              <p className="empty-title">Carregando agenda...</p>
            </div>
          ) : agendamentosDia.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <p className="empty-title">Nenhuma consulta neste dia</p>
              <p className="empty-sub">
                Clique em "Novo Agendamento" para adicionar
              </p>
              <button className="btn btn-primary" onClick={abrirNovoModal}>
                + Novo Agendamento
              </button>
            </div>
          ) : (
            <div className="agendamentos-lista">
              {agendamentosDia.map((ag) => (
                <AgendamentoCard
                  key={ag.id}
                  agendamento={ag}
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
  onEditar: () => void;
  onExcluir: () => void;
  onAlterarStatus: (status: StatusAgendamento) => void;
}

const AgendamentoCard: React.FC<CardProps> = ({
  agendamento: ag,
  onEditar,
  onExcluir,
  onAlterarStatus,
}) => {
  return (
    <div className={`ag-card ag-card-${ag.status}`}>
      {/* Barra lateral colorida */}
      <div
        className="ag-barra"
        style={{ backgroundColor: ag.fisioterapeuta.cor }}
      />

      <div className="ag-content">
        {/* Linha 1: Hora + Status */}
        <div className="ag-row-top">
          <span className="ag-hora">
            {ag.horaInicio} – {ag.horaFim}
          </span>
          <span className={`badge badge-${ag.status}`}>
            {STATUS_LABEL[ag.status]}
          </span>
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
        <div className="ag-fisio" style={{ color: ag.fisioterapeuta.cor }}>
          {ag.fisioterapeuta.nome}
        </div>

        {/* Convênio */}
        {ag.paciente.convenio && (
          <div className="ag-convenio">{ag.paciente.convenio}</div>
        )}

        {/* Observações */}
        {ag.observacoes && <div className="ag-obs">{ag.observacoes}</div>}

        {/* Ações */}
        <div className="ag-acoes">
          <div className="ag-status-group">
            {(
              [
                "confirmado",
                "pendente",
                "cancelado",
                "concluido",
              ] as StatusAgendamento[]
            ).map((s) => (
              <button
                key={s}
                className={`btn-status btn-status-${s} ${ag.status === s ? "ativo" : ""}`}
                onClick={() => onAlterarStatus(s)}
                title={STATUS_LABEL[s]}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="ag-btn-group">
            <button className="btn-icone" onClick={onEditar} title="Editar">
              ✏️
            </button>
            <button
              className="btn-icone btn-excluir"
              onClick={onExcluir}
              title="Excluir"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
