export interface DashboardStats {
  activePatients: number;
  todayAppointments: number;
  monthRevenue: number;
  overdueAmount: number;
}

export interface FinancialChartPoint {
  name: string;
  faturamento: number;
  despesas: number;
  saldo: number;
}

export interface BirthdayPatient {
  id: string;
  name: string;
  phone: string | null;
  birthDate: string;
  label: string;
  age: number;
  daysUntil: number;
}

export interface DashboardData {
  stats: DashboardStats;
  chartData: FinancialChartPoint[];
  birthdays: BirthdayPatient[];
}
