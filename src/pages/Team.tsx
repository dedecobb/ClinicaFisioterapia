import { FormEvent, useEffect, useState } from "react";
import { Mail, Plus, UserCheck } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { messages } from "../i18n";
import { supabase } from "../lib/supabase";

type TeamProfile = {
  id: string;
  full_name: string;
  role: string;
};

type Invitation = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string;
};

export const Team = () => {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin";

  const loadTeam = async () => {
    if (!profile?.clinic_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [profilesResult, invitationsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("clinic_id", profile.clinic_id)
        .order("full_name", { ascending: true }),
      supabase
        .from("professional_invitations")
        .select("id, email, full_name, role, status, created_at")
        .eq("clinic_id", profile.clinic_id)
        .order("created_at", { ascending: false }),
    ]);

    const failed = [profilesResult, invitationsResult].find(
      (result) => result.error,
    );
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setProfiles((profilesResult.data ?? []) as TeamProfile[]);
    setInvitations((invitationsResult.data ?? []) as Invitation[]);
    setLoading(false);
  };

  useEffect(() => {
    loadTeam();
  }, [profile?.clinic_id]);

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile?.clinic_id || !isAdmin) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("professional_invitations").insert({
      clinic_id: profile.clinic_id,
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      role: "physio",
      created_by: profile.id,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setFullName("");
    setEmail("");
    setSaving(false);
    await loadTeam();
  };

  if (!isAdmin) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Acesso restrito
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Apenas a administradora pode gerenciar a equipe.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Equipe
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Convide fisioterapeutas para acessarem somente seus pacientes, agenda
          e produção.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Card title="Convidar fisioterapeuta">
        <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
          <div className="relative">
            <UserCheck
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              required
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="Nome da fisioterapeuta"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              required
              type="email"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" className="gap-2" isLoading={saving}>
            <Plus size={18} /> Convidar
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Profissionais ativos">
          {loading ? (
            <p className="text-sm text-slate-500">Carregando equipe...</p>
          ) : (
            <div className="space-y-3">
              {profiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 p-3"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {item.full_name}
                    </p>
                    <p className="text-xs text-slate-500">{item.role}</p>
                  </div>
                  <Badge variant={item.role === "admin" ? "info" : "success"}>
                    {item.role === "admin" ? messages.team.roles.admin : messages.team.roles.physio}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Convites">
          <div className="space-y-3">
            {invitations.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum convite enviado.</p>
            ) : (
              invitations.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 p-3"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {item.full_name}
                    </p>
                    <p className="text-xs text-slate-500">{item.email}</p>
                  </div>
                  <Badge
                    variant={item.status === "accepted" ? "success" : "warning"}
                  >
                    {item.status === "accepted"
                      ? messages.team.invitationStatus.accepted
                      : messages.team.invitationStatus.pending}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
