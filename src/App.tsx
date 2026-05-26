import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Agenda } from './pages/Agenda';
import { Patients } from './pages/Patients';
import { Financial } from './pages/Financial';
import { Pilates } from './pages/Pilates';
import { WhatsApp } from './pages/WhatsApp';
import { ClinicalHub } from './pages/ClinicalHub';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AuthProvider, useAuth } from './context/AuthContext';

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();

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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
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
          <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
          <Route path="/agenda" element={<ProtectedLayout><Agenda /></ProtectedLayout>} />
          <Route path="/pacientes" element={<ProtectedLayout><Patients /></ProtectedLayout>} />
          <Route path="/pacientes/:id/prontuario" element={<ProtectedLayout><ClinicalHub /></ProtectedLayout>} />
          <Route path="/pilates" element={<ProtectedLayout><Pilates /></ProtectedLayout>} />
          <Route path="/financeiro" element={<ProtectedLayout><Financial /></ProtectedLayout>} />
          <Route path="/whatsapp" element={<ProtectedLayout><WhatsApp /></ProtectedLayout>} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
