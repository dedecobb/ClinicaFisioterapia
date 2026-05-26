import React, { useCallback, useRef, useState } from "react";
import {
  X,
  Upload,
  File,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Button } from "../ui/Button";
import { clsx } from "clsx";
import { uploadExame, extensaoArquivo } from "../../services/evolutionService";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type FileStatus = "idle" | "uploading" | "done" | "error";

interface FileEntry {
  file: File;
  status: FileStatus;
  url?: string;
  error?: string;
  preview?: string; // para imagens
}

interface Props {
  aberto: boolean;
  patientId: string;
  onFechar: () => void;
  // Callback com as URLs prontas para salvar na evolução
  onAnexar: (urls: string[]) => void;
}

// ── Ícone por tipo de arquivo ─────────────────────────────────────────────────

const EXTENSAO_COR: Record<string, string> = {
  pdf: "text-rose-500 bg-rose-50 dark:bg-rose-900/20",
  jpg: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  jpeg: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  png: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  doc: "text-brand-500 bg-brand-50 dark:bg-brand-900/20",
  docx: "text-brand-500 bg-brand-50 dark:bg-brand-900/20",
  default: "text-slate-500 bg-slate-100 dark:bg-slate-800",
};

function corExtensao(url: string): string {
  const ext = extensaoArquivo(url);
  return EXTENSAO_COR[ext] ?? EXTENSAO_COR.default;
}

// ── Componente ────────────────────────────────────────────────────────────────

export const UploadExameModal: React.FC<Props> = ({
  aberto,
  patientId,
  onFechar,
  onAnexar,
}) => {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isDragging, setIsDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const atualizar = (index: number, patch: Partial<FileEntry>) =>
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    );

  // ── Adicionar arquivos ───────────────────────────────────────────────────────

  const adicionarArquivos = (files: FileList | null) => {
    if (!files) return;
    const novos: FileEntry[] = Array.from(files).map((file) => {
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      return { file, status: "idle", preview };
    });
    setEntries((prev) => [...prev, ...novos]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDrag(false);
    adicionarArquivos(e.dataTransfer.files);
  }, []);

  const removerEntry = (index: number) => {
    setEntries((prev) => {
      const entry = prev[index];
      if (entry.preview) URL.revokeObjectURL(entry.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ── Upload individual ────────────────────────────────────────────────────────

  const uploadEntry = async (index: number, entry: FileEntry) => {
    atualizar(index, { status: "uploading", error: undefined });
    try {
      const url = await uploadExame(patientId, entry.file);
      atualizar(index, { status: "done", url });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      atualizar(index, { status: "error", error: msg });
    }
  };

  // ── Upload de todos ──────────────────────────────────────────────────────────

  const uploadTodos = async () => {
    const pendentes = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.status === "idle" || e.status === "error");

    await Promise.all(pendentes.map(({ e, i }) => uploadEntry(i, e)));
  };

  // ── Confirmar e devolver URLs ────────────────────────────────────────────────

  const confirmar = () => {
    const urls = entries
      .filter((e) => e.status === "done" && e.url)
      .map((e) => e.url!);
    if (urls.length === 0) return;
    onAnexar(urls);
    setEntries([]);
    onFechar();
  };

  const totalFeito = entries.filter((e) => e.status === "done").length;
  const totalErro = entries.filter((e) => e.status === "error").length;
  const totalEnviado = entries.filter((e) => e.status === "uploading").length;
  const podeConfirmar = totalFeito > 0 && totalEnviado === 0;

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Anexar Exames
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              PDF, imagens ou documentos
            </p>
          </div>
          <button
            onClick={onFechar}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Zona de drop */}
        <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
          <div
            className={clsx(
              "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
              isDragging
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                : "border-slate-200 dark:border-slate-700 hover:border-brand-400 hover:bg-slate-50 dark:hover:bg-slate-800/50",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDrag(true);
            }}
            onDragLeave={() => setIsDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload
              size={28}
              className={clsx(
                "mx-auto mb-3",
                isDragging ? "text-brand-500" : "text-slate-400",
              )}
            />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Arraste arquivos aqui ou{" "}
              <span className="text-brand-600">clique para selecionar</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              PDF, JPG, PNG, DOCX — até 10MB por arquivo
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={(e) => adicionarArquivos(e.target.files)}
            />
          </div>

          {/* Lista de arquivos */}
          {entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                >
                  {/* Preview ou ícone */}
                  {entry.preview ? (
                    <img
                      src={entry.preview}
                      alt="preview"
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className={clsx(
                        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                        corExtensao(entry.file.name),
                      )}
                    >
                      <File size={18} />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {entry.file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(entry.file.size / 1024).toFixed(0)} KB
                    </p>
                    {entry.error && (
                      <p className="text-xs text-rose-500 mt-0.5">
                        {entry.error}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {entry.status === "uploading" && (
                      <Loader2
                        size={18}
                        className="text-brand-500 animate-spin"
                      />
                    )}
                    {entry.status === "done" && (
                      <CheckCircle size={18} className="text-emerald-500" />
                    )}
                    {entry.status === "error" && (
                      <button
                        onClick={() => uploadEntry(i, entry)}
                        title="Tentar novamente"
                        className="text-rose-400 hover:text-rose-600"
                      >
                        <AlertCircle size={18} />
                      </button>
                    )}
                    {entry.status !== "uploading" && (
                      <button
                        onClick={() => removerEntry(i)}
                        className="text-slate-300 hover:text-rose-400 transition-colors"
                        title="Remover"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {entries.length > 0 && (
              <span>
                {totalFeito}/{entries.length} enviado
                {totalFeito !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar}>
              Cancelar
            </Button>

            {entries.some(
              (e) => e.status === "idle" || e.status === "error",
            ) && (
              <Button
                variant="outline"
                onClick={uploadTodos}
                disabled={totalEnviado > 0}
              >
                {totalEnviado > 0 ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <Upload size={14} /> Enviar{" "}
                    {
                      entries.filter(
                        (e) => e.status === "idle" || e.status === "error",
                      ).length
                    }{" "}
                    arquivo{entries.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            )}

            <Button onClick={confirmar} disabled={!podeConfirmar}>
              <CheckCircle size={14} />
              Anexar {totalFeito > 0 ? `(${totalFeito})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
