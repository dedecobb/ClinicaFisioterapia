import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Loader2 } from "lucide-react";
import {
  getPatientOpenReceivables,
  OpenReceivable,
  registerReceiptForOpenReceivable,
} from "../../services/financialService";
import { useAuth } from "../../context/AuthContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  onSaved?: () => void;
}

export const RegisterReceiptModal = ({ isOpen, onClose, patientId, patientName, onSaved }: Props) => {
  const { profile } = useAuth();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [saving, setSaving] = useState(false);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [receivables, setReceivables] = useState<OpenReceivable[]>([]);
  const [selectedReceivableId, setSelectedReceivableId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAmount("");
    setNotes("");
    setPaymentMethod("Pix");
    setError(null);
    setReceivables([]);
    setSelectedReceivableId("");

    if (!profile?.clinic_id) return;
    setLoadingOpen(true);
    getPatientOpenReceivables(profile.clinic_id, patientId)
      .then((items) => {
        setReceivables(items);
        setSelectedReceivableId(items[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingOpen(false));
  }, [isOpen, patientId, profile?.clinic_id]);

  if (!isOpen) return null;

  const parseAmount = (v: string) => {
    const digits = v.replace(/[^0-9,.]/g, "").replace(",", ".");
    return Number(digits) || 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      setError("Informe um valor válido.");
      return;
    }

    if (!profile?.clinic_id) {
      setError("Clínica não identificada.");
      return;
    }

    const receivable = receivables.find((item) => item.id === selectedReceivableId);
    if (!receivable) {
      setError("Não há recebíveis em aberto para este paciente.");
      return;
    }

    if (value > receivable.remaining) {
      setError("O valor não pode ser maior que o saldo do recebível selecionado.");
      return;
    }

    setSaving(true);
    try {
      await registerReceiptForOpenReceivable({
        clinicId: profile.clinic_id,
        patientId,
        receivable,
        amount: value,
        date,
        paymentMethod,
        notes: notes || null,
      });

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <Card className="z-10 w-full max-w-md p-6">
        <h3 className="text-lg font-semibold">Registrar recebimento</h3>
        <p className="text-sm text-slate-500 mt-1">Paciente: {patientName}</p>

        {loadingOpen ? (
          <div className="mt-4 flex items-center gap-2 text-slate-500">
            <Loader2 className="animate-spin" /> Verificando saldo em aberto...
          </div>
        ) : receivables.length > 0 ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Selecione abaixo o recebível em aberto para fazer a baixa. O Financeiro será atualizado no mesmo lançamento.
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Não há recebíveis em aberto para este paciente.
          </div>
        )}

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium">Recebível em aberto</label>
            <select
              value={selectedReceivableId}
              onChange={(e) => setSelectedReceivableId(e.target.value)}
              disabled={loadingOpen || receivables.length === 0}
              className="w-full rounded-lg border px-3 py-2 mt-1 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {receivables.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · vence em {new Date(`${item.dueDate}T12:00:00`).toLocaleDateString("pt-BR")} · saldo {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.remaining)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Valor</label>
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border px-3 py-2 mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Forma de pagamento</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-lg border px-3 py-2 mt-1">
              <option>Pix</option>
              <option>Cartão de crédito</option>
              <option>Cartão de débito</option>
              <option>Dinheiro</option>
              <option>Transferência</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Data do recebimento</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border px-3 py-2 mt-1" />
          </div>

          <div>
            <label className="text-sm font-medium">Observação (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border px-3 py-2 mt-1" rows={3} />
          </div>

          {error && <div className="text-sm text-rose-600">{error}</div>}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={onClose} type="button">Cancelar</Button>
            <Button type="submit" className="gap-2" disabled={saving || loadingOpen || receivables.length === 0}>
              {saving ? <Loader2 className="animate-spin" /> : "Registrar"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default RegisterReceiptModal;
