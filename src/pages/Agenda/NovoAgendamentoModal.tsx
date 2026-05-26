import React, { useEffect, useState } from "react";
import {
  Agendamento,
  Fisioterapeuta,
  NovoAgendamentoForm,
  Paciente,
  TipoSessao,
} from "./types";

const TIPOS_SESSAO: TipoSessao[] = [
  "Avaliação Inicial",
  "Fisioterapia Ortopédica",
  "Fisioterapia Neurológica",
  "Fisioterapia Respiratória",
  "Pilates Clínico",
  "RPG",
  "Acupuntura",
  "Hidroterapia",
];

interface Props {
  aberto: boolean;
  agendamento?: Agendamento | null;
  pacientes: Paciente[];
  fisioterapeutas: Fisioterapeuta[];
  dataInicial?: string;
  salvando?: boolean;
  onFechar: () => void;
  onSalvar: (form: NovoAgendamentoForm) => void;
}

const formVazio: NovoAgendamentoForm = {
  pacienteId: "",
  fisioterapeutaId: "",
  data: "",
  horaInicio: "08:00",
  horaFim: "08:50",
  tipoSessao: "Fisioterapia Ortopédica",
  status: "pendente",
  observacoes: "",
  sessaoNumero: 1,
  totalSessoes: 10,
};

export const NovoAgendamentoModal: React.FC<Props> = ({
  aberto,
  agendamento,
  pacientes,
  fisioterapeutas,
  dataInicial,
  salvando = false,
  onFechar,
  onSalvar,
}) => {
  const [form, setForm] = useState<NovoAgendamentoForm>(formVazio);

  useEffect(() => {
    if (agendamento) {
      setForm({
        pacienteId: agendamento.pacienteId,
        fisioterapeutaId: agendamento.fisioterapeutaId,
        data: agendamento.data,
        horaInicio: agendamento.horaInicio,
        horaFim: agendamento.horaFim,
        tipoSessao: agendamento.tipoSessao,
        status: agendamento.status,
        observacoes: agendamento.observacoes ?? "",
        sessaoNumero: agendamento.sessaoNumero ?? 1,
        totalSessoes: agendamento.totalSessoes ?? 10,
      });
    } else {
      setForm({ ...formVazio, data: dataInicial ?? "" });
    }
  }, [agendamento, dataInicial, aberto]);

  const campo = <K extends keyof NovoAgendamentoForm>(
    key: K,
    value: NovoAgendamentoForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSalvar(form);
  };

  if (!aberto) return null;

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {agendamento ? "Editar Agendamento" : "Novo Agendamento"}
            </h2>
            <p className="modal-subtitle">
              {agendamento
                ? "Atualize os dados da consulta"
                : "Preencha os dados para agendar a consulta"}
            </p>
          </div>
          <button
            className="btn-close"
            onClick={onFechar}
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Paciente */}
            <div className="form-group">
              <label className="form-label">Paciente *</label>
              <select
                className="form-select"
                value={form.pacienteId}
                onChange={(e) => campo("pacienteId", e.target.value)}
                required
              >
                <option value="">Selecione o paciente</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Fisioterapeuta */}
            <div className="form-group">
              <label className="form-label">Fisioterapeuta *</label>
              <select
                className="form-select"
                value={form.fisioterapeutaId}
                onChange={(e) => campo("fisioterapeutaId", e.target.value)}
                required
              >
                <option value="">Selecione o fisioterapeuta</option>
                {fisioterapeutas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Data e Horários */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Data *</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.data}
                  onChange={(e) => campo("data", e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Início *</label>
                <input
                  type="time"
                  className="form-input"
                  value={form.horaInicio}
                  onChange={(e) => campo("horaInicio", e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Fim *</label>
                <input
                  type="time"
                  className="form-input"
                  value={form.horaFim}
                  onChange={(e) => campo("horaFim", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Tipo de Sessão */}
            <div className="form-group">
              <label className="form-label">Tipo de Sessão *</label>
              <select
                className="form-select"
                value={form.tipoSessao}
                onChange={(e) =>
                  campo("tipoSessao", e.target.value as TipoSessao)
                }
                required
              >
                {TIPOS_SESSAO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="form-group">
              <label className="form-label">Status</label>
              <div className="status-radio-group">
                {(
                  ["pendente", "confirmado", "cancelado", "concluido"] as const
                ).map((s) => (
                  <label
                    key={s}
                    className={`status-radio ${form.status === s ? "active" : ""} status-${s}`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={s}
                      checked={form.status === s}
                      onChange={() => campo("status", s)}
                    />
                    <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sessão */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Sessão nº</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  value={form.sessaoNumero}
                  onChange={(e) =>
                    campo("sessaoNumero", Number(e.target.value))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Total de sessões</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  value={form.totalSessoes}
                  onChange={(e) =>
                    campo("totalSessoes", Number(e.target.value))
                  }
                />
              </div>
            </div>

            {/* Observações */}
            <div className="form-group">
              <label className="form-label">Observações</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Informações relevantes sobre a consulta..."
                value={form.observacoes}
                onChange={(e) => campo("observacoes", e.target.value)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onFechar}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando
                ? "Salvando..."
                : agendamento
                  ? "Salvar Alterações"
                  : "Criar Agendamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
