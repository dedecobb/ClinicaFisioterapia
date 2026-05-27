import { FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Building, User } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `clinica-${Date.now()}`;
}

export const SetupClinic = () => {
  const { user, refreshProfile, signOut } = useAuth();
  const defaultName = useMemo(() => {
    const metadataName = user?.user_metadata?.full_name;
    return typeof metadataName === "string" ? metadataName : "";
  }, [user?.user_metadata?.full_name]);

  const [fullName, setFullName] = useState(defaultName);
  const [clinicName, setClinicName] = useState("");
  const [invitation, setInvitation] = useState<{
    id: string;
    clinic_id: string;
    full_name: string;
    role: "physio" | "receptionist";
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkInvitation() {
      if (!user?.email) {
        setCheckingInvite(false);
        return;
      }

      const { data, error } = await supabase
        .from("professional_invitations")
        .select("id, clinic_id, full_name, role")
        .eq("email", user.email.toLowerCase())
        .eq("status", "pending")
        .maybeSingle();

      if (!active) return;

      if (!error && data) {
        setInvitation(data as typeof invitation);
        setFullName((data as { full_name: string }).full_name);
      }

      setCheckingInvite(false);
    }

    checkInvitation();

    return () => {
      active = false;
    };
  }, [user?.email]);

  const acceptInvitation = async () => {
    if (!user || !invitation) return;

    setLoading(true);
    setError(null);

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      clinic_id: invitation.clinic_id,
      full_name: fullName.trim() || invitation.full_name,
      role: invitation.role,
    });

    if (profileError) {
      setError(`Erro ao aceitar convite: ${profileError.message}`);
      setLoading(false);
      return;
    }

    const { error: invitationError } = await supabase
      .from("professional_invitations")
      .update({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (invitationError) {
      console.warn("Invitation was accepted but not updated:", invitationError);
    }

    await refreshProfile();
    setLoading(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      setError("Sessão não encontrada. Faça login novamente.");
      return;
    }

    setLoading(true);
    setError(null);

    const clinicSlug = slugify(clinicName);

    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .insert({
        name: clinicName.trim(),
        slug: clinicSlug,
        owner_id: user.id,
      })
      .select("id")
      .single();

    if (clinicError) {
      setError(`Erro ao criar clínica: ${clinicError.message}`);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      clinic_id: clinic.id,
      full_name: fullName.trim() || user.email || "Administrador",
      role: "admin",
    });

    if (profileError) {
      setError(`Erro ao criar administrador: ${profileError.message}`);
      setLoading(false);
      return;
    }

    await refreshProfile();
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl text-white shadow-xl shadow-brand-200 dark:shadow-none mb-4">
            <Activity size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {invitation ? "Aceitar convite" : "Configurar administrador"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {checkingInvite
              ? "Verificando se existe convite para este usuário."
              : invitation
                ? "Você foi convidada para acessar a clínica como fisioterapeuta."
                : "Seu login existe, mas a clínica e o perfil admin ainda não foram recriados."}
          </p>
        </div>

        <Card className="p-8">
          {checkingInvite ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Verificando convite...
            </div>
          ) : invitation ? (
            <div className="space-y-5">
              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl text-rose-600 text-sm text-center">
                  {error}
                </div>
              )}

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                Convite encontrado para{" "}
                <span className="font-semibold">{user?.email}</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nome da profissional
                </label>
                <input
                  required
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:opacity-60"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>

              <Button
                type="button"
                className="w-full h-12 gap-2"
                isLoading={loading}
                onClick={acceptInvitation}
              >
                Entrar como fisioterapeuta <ArrowRight size={18} />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl text-rose-600 text-sm text-center">
                {error}
              </div>
            )}

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Usuário autenticado:{" "}
              <span className="font-semibold">{user?.email}</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nome do administrador
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  required
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:opacity-60"
                  placeholder="Dra. Nome Sobrenome"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nome da clínica / estúdio
              </label>
              <div className="relative">
                <Building
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  required
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:opacity-60"
                  placeholder="Biofisio Pilates"
                  value={clinicName}
                  onChange={(event) => setClinicName(event.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 gap-2"
              isLoading={loading}
            >
              Criar clínica e perfil admin <ArrowRight size={18} />
            </Button>
          </form>
          )}

          <div className="mt-6 text-center">
            <button
              type="button"
              className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
              onClick={signOut}
            >
              Sair e usar outro login
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};
