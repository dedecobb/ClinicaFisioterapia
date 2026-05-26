import React, { useState } from "react";
import { X, Search, ChevronRight, Activity } from "lucide-react";
import { Button } from "../ui/Button";
import { clsx } from "clsx";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Protocolo {
  id: string;
  categoria: string;
  titulo: string;
  texto: string;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  // Retorna o texto do protocolo para inserir no textarea
  onInserir: (texto: string) => void;
}

// ── Protocolos pré-definidos ──────────────────────────────────────────────────

const PROTOCOLOS: Protocolo[] = [
  // ── Coluna/Lombar ──
  {
    id: "p1",
    categoria: "Coluna e Lombar",
    titulo: "Lombalgia — Protocolo Padrão",
    texto:
      "Paciente comparece para sessão de fisioterapia referindo dor lombar. Realizada mobilização articular segmentar em L4-L5, exercícios de estabilização segmentar (ponte glútea, bird-dog) e alongamento de cadeia posterior. Orientações posturais fornecidas para AVDs. Paciente tolerou bem os procedimentos.",
  },
  {
    id: "p2",
    categoria: "Coluna e Lombar",
    titulo: "Hérnia de Disco — Método McKenzie",
    texto:
      "Sessão realizada com abordagem McKenzie. Avaliação das preferências direcionais: centralização da dor com extensão lombar em pronação. Exercícios de extensão em DV realizados em série de 10 repetições. Paciente instruído a manter postura em lordose e evitar flexão sustentada.",
  },
  {
    id: "p3",
    categoria: "Coluna e Lombar",
    titulo: "Cervicalgia — Mobilização e Estabilização",
    texto:
      "Paciente apresenta cervicalgia com limitação de rotação para direita. Realizada mobilização articular graus I e II em articulações cervicais médias, tração manual cervical, exercícios de estabilização profunda (flexão crânio-cervical) e alongamento de trapézio e esternocleidomastoideo. EVA pós-sessão: informar.",
  },

  // ── Ombro ──
  {
    id: "p4",
    categoria: "Ombro",
    titulo: "Síndrome do Impacto — Pós-fase aguda",
    texto:
      "Realizado aquecimento com mobilização passiva de ombro (Codman). Exercícios de fortalecimento de manguito rotador com theraband (rotação externa e interna), reforço de serrátil anterior e trapézio inferior. Mobilização glenoumeral posterior. Paciente relata EVA __/10 antes e após sessão.",
  },
  {
    id: "p5",
    categoria: "Ombro",
    titulo: "Pós-operatório de Manguito Rotador",
    texto:
      "Protocolo pós-cirúrgico de manguito rotador — semana __. Exercícios dentro da amplitude protegida pelo cirurgião. Movimentação pendular de Codman, mobilização passiva de flexão até __ graus. Crioterapia ao final da sessão por 15 minutos. Edema: presente / ausente. Aderência ao tratamento: boa.",
  },

  // ── Joelho ──
  {
    id: "p6",
    categoria: "Joelho",
    titulo: "Condromalácia Patelar",
    texto:
      "Abordagem para condromalácia patelar. Realizado fortalecimento de vasto medial oblíquo (VMO) com agachamento isométrico a 30°, exercícios em cadeia cinética fechada, mobilização patelar medial e lateral, massagem de liberação do retináculo lateral. Orientação sobre descida de escadas e agachamento profundo.",
  },
  {
    id: "p7",
    categoria: "Joelho",
    titulo: "Pós-operatório LCA — Fase 1",
    texto:
      "Pós-operatório de LCA — semana __. Objetivos desta fase: controle do edema, recuperação da ADM e ativação do quadríceps. Exercícios: contrações isométricas de quadríceps, elevação do membro estendido (EMS), flexão passiva até __ graus, crioterapia e TENS para analgesia. Deambula com muletas / sem muletas.",
  },

  // ── Quadril ──
  {
    id: "p8",
    categoria: "Quadril",
    titulo: "Artrose de Quadril",
    texto:
      "Sessão para artrose de quadril. Realizada mobilização acessória (tração e deslizamento caudal) para ganho de ADM em flexão e rotação interna, fortalecimento de abdutores (glúteo médio) e estabilizadores pélvicos. Hidroterapia indicada como complemento. Paciente orientado sobre proteção articular.",
  },

  // ── Neurológico ──
  {
    id: "p9",
    categoria: "Neurológico",
    titulo: "Hemiplegia — Reabilitação Funcional",
    texto:
      "Sessão de fisioterapia neurológica. Abordagem por conceito Bobath. Trabalhado alinhamento postural em sedestação, atividades de alcance com membro superior afetado, transferências e treino de marcha com supervisão. Espasticidade: presente em __. Funcional Score: __.",
  },
  {
    id: "p10",
    categoria: "Neurológico",
    titulo: "Neuropatia Periférica",
    texto:
      "Sessão para neuropatia periférica. Estimulação sensorial com diferentes texturas, exercícios de propriocepção em superfície estável e instável, alongamento de cadeia posterior de MMII, TENS sensitivo para estimulação nervosa. Paciente relata parestesia em __.",
  },

  // ── Respiratório ──
  {
    id: "p11",
    categoria: "Respiratório",
    titulo: "DPOC — Higiene Brônquica",
    texto:
      "Fisioterapia respiratória para DPOC. Realizada: flutter/shaker por 10 minutos, huffing e tosse assistida, drenagem postural em decúbito lateral, exercícios respiratórios com ênfase na expiração freno-labial. SpO2 antes: __% / após: __%. Ausculta: roncos/crepitações em __.",
  },
  {
    id: "p12",
    categoria: "Respiratório",
    titulo: "Pós-operatório Torácico",
    texto:
      "Fisioterapia respiratória pós-operatória. Exercícios de expansão pulmonar com espirômetro de incentivo, respiração diafragmática, manobras de higiene brônquica (ELTGOL, AFE), tosse assistida com almofada. Dreno: presente / retirado. Dor ao tosse: EVA __/10.",
  },

  // ── Pilates / RPG ──
  {
    id: "p13",
    categoria: "Pilates Clínico",
    titulo: "Sessão de Pilates — Iniciante",
    texto:
      "Sessão de pilates clínico. Exercícios realizados: cem (hundred) — 5 séries, roll up, leg circle, série single leg stretch, spine stretch forward e saw. Foco em ativação do powerhouse e respiração lateral. Paciente apresenta boa evolução na estabilização central.",
  },
  {
    id: "p14",
    categoria: "Pilates Clínico",
    titulo: "RPG — Cadeia Posterior",
    texto:
      "Sessão de RPG — cadeia posterior. Postura trabalhada: __ (sentado/em pé). Tempo de manutenção: __ minutos. Tensão percebida em: __. Paciente orientado sobre respiração durante a postura. Reavaliação postural agendada para __.",
  },
];

// ── Componente ────────────────────────────────────────────────────────────────

const CATEGORIAS = [...new Set(PROTOCOLOS.map((p) => p.categoria))];

export const ProtocolosModal: React.FC<Props> = ({
  aberto,
  onFechar,
  onInserir,
}) => {
  const [busca, setBusca] = useState("");
  const [categoriaSel, setCategoriaSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<Protocolo | null>(null);

  const filtrados = PROTOCOLOS.filter((p) => {
    const matchCategoria = !categoriaSel || p.categoria === categoriaSel;
    const matchBusca =
      !busca.trim() ||
      p.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      p.texto.toLowerCase().includes(busca.toLowerCase());
    return matchCategoria && matchBusca;
  });

  const handleInserir = (p: Protocolo) => {
    onInserir(p.texto);
    setPreview(null);
    setBusca("");
    setCategoriaSel(null);
    onFechar();
  };

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl">
              <Activity size={18} className="text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Protocolos Clínicos
              </h2>
              <p className="text-xs text-slate-400">
                Selecione um template para inserir na evolução
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        {/* Busca */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar protocolo..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* Filtros de categoria */}
          <div className="flex gap-2 flex-wrap mt-2">
            <button
              onClick={() => setCategoriaSel(null)}
              className={clsx(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                !categoriaSel
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200",
              )}
            >
              Todos
            </button>
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setCategoriaSel(cat === categoriaSel ? null : cat)
                }
                className={clsx(
                  "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                  categoriaSel === cat
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo: lista + preview */}
        <div className="flex flex-1 overflow-hidden">
          {/* Lista */}
          <div className="w-1/2 border-r border-slate-100 dark:border-slate-800 overflow-y-auto">
            {filtrados.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Nenhum protocolo encontrado.
              </div>
            ) : (
              filtrados.map((p) => (
                <button
                  key={p.id}
                  className={clsx(
                    "w-full text-left px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center gap-2",
                    preview?.id === p.id && "bg-brand-50 dark:bg-brand-900/20",
                  )}
                  onClick={() => setPreview(p)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-0.5">
                      {p.categoria}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {p.titulo}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-slate-300 flex-shrink-0"
                  />
                </button>
              ))
            )}
          </div>

          {/* Preview */}
          <div className="w-1/2 p-5 overflow-y-auto flex flex-col">
            {preview ? (
              <>
                <div className="mb-3">
                  <p className="text-xs font-bold text-brand-600 uppercase tracking-wide">
                    {preview.categoria}
                  </p>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {preview.titulo}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
                  {preview.texto}
                </p>
                <Button
                  className="mt-4 w-full gap-2"
                  onClick={() => handleInserir(preview)}
                >
                  Inserir na Evolução
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                <Activity size={28} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">Selecione um protocolo</p>
                <p className="text-xs mt-1">
                  O texto aparecerá aqui para preview
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
