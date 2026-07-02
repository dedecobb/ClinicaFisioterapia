import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Agenda } from "./pages/Agenda";
import { Patients } from "./pages/Pacientes";
import { Financial } from "./pages/Financial";
import { ServiceInvoices } from "./pages/ServiceInvoices";
import { WhatsApp } from "./pages/WhatsApp";
import { Team } from "./pages/Team";
import { ClinicalHub } from "./pages/ClinicalHub";
import { Certificates } from "./pages/Certificates";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { SetupClinic } from "./pages/SetupClinic";
import { AuthProvider, useAuth } from "./context/AuthContext";

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <SetupClinic />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:p-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedLayout>
                <Dashboard />
              </ProtectedLayout>
            }
          />
          <Route
            path="/agenda"
            element={
              <ProtectedLayout>
                <Agenda />
              </ProtectedLayout>
            }
          />
          <Route
            path="/pacientes"
            element={
              <ProtectedLayout>
                <Patients />
              </ProtectedLayout>
            }
          />
          <Route
            path="/pacientes/:id/prontuario"
            element={
              <ProtectedLayout>
                <ClinicalHub />
              </ProtectedLayout>
            }
          />
          <Route
            path="/financeiro"
            element={
              <ProtectedLayout>
                <Financial />
              </ProtectedLayout>
            }
          />
          <Route
            path="/notas-fiscais"
            element={
              <ProtectedLayout>
                <ServiceInvoices />
              </ProtectedLayout>
            }
          />
          <Route
            path="/atestados"
            element={
              <ProtectedLayout>
                <Certificates />
              </ProtectedLayout>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <ProtectedLayout>
                <WhatsApp />
              </ProtectedLayout>
            }
          />
          <Route
            path="/equipe"
            element={
              <ProtectedLayout>
                <Team />
              </ProtectedLayout>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
