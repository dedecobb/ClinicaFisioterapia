import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface Profile {
  id: string;
  clinic_id: string;
  full_name: string;
  role: "admin" | "physio" | "receptionist";
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type Clinic = {
  id: string;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const createProfileFromOwnedClinic = async (
    currentUser: User,
  ): Promise<Profile | null> => {
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id")
      .eq("owner_id", currentUser.id)
      .maybeSingle();

    if (clinicError || !clinic) {
      if (clinicError) {
        console.error("Error fetching owned clinic:", clinicError);
      }
      return null;
    }

    const fullName =
      typeof currentUser.user_metadata?.full_name === "string"
        ? currentUser.user_metadata.full_name
        : currentUser.email ?? "Administrador";

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: currentUser.id,
        clinic_id: (clinic as Clinic).id,
        full_name: fullName,
        role: "admin",
      })
      .select("*")
      .single();

    if (profileError) {
      console.error("Error creating profile from owned clinic:", profileError);
      return null;
    }

    return profile as Profile;
  };

  const fetchProfile = async (currentUser: User) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
      return;
    }

    if (error) {
      console.error("Error fetching profile:", error);
    }

    const recoveredProfile = await createProfileFromOwnedClinic(currentUser);
    setProfile(recoveredProfile);
  };

  const applySession = async (session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);

    if (session?.user) {
      await fetchProfile(session.user);
    } else {
      setProfile(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
