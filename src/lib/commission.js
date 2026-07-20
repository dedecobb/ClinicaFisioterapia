function money(value) {
  return Number(value) || 0;
}

function parseDateInput(value) {
  return new Date(`${value}T12:00:00`);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function listDateRange(startDate, endDate) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  const days = Math.max(Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1, 0);
  return Array.from({ length: days }, (_, index) => toDateInputValue(addDays(start, index)));
}

function getAppointmentResponsibleProfessional(appointment) {
  const responsible = appointment.patients?.profiles;
  if (responsible?.id || responsible?.full_name) {
    return {
      id: responsible.id ?? "sem-profissional",
      full_name: responsible.full_name ?? "Sem profissional definido",
    };
  }

  return {
    id: appointment.profiles?.id ?? "sem-profissional",
    full_name: appointment.profiles?.full_name ?? "Sem profissional definido",
  };
}

function getCommissionClassValue(appointment) {
  const packageItem = appointment.lesson_packages;

  if (!packageItem) return money(appointment.class_price);

  const totalLessons = Number(packageItem.total_lessons) || 0;
  const lessonsAmount = Math.max(
    money(packageItem.total_amount) - money(packageItem.procedure_amount),
    0,
  );

  if (totalLessons > 0 && lessonsAmount > 0) {
    return lessonsAmount / totalLessons;
  }

  return money(packageItem.lesson_value) || money(appointment.class_price);
}

export function isCommissionableAppointment(status) {
  return status !== "cancelada" && status !== "cancelled";
}

export function buildCommissionReport(appointments, ownerId = null, startDate, endDate) {
  const report = new Map();

  let filtered = appointments.filter((appointment) => isCommissionableAppointment(appointment.status));

  if (startDate) {
    const start = parseDateInput(startDate);
    start.setHours(0, 0, 0, 0);
    filtered = filtered.filter((appointment) => {
      const appointmentDate = new Date(appointment.start_time);
      return appointmentDate >= start;
    });
  }

  if (endDate) {
    const end = parseDateInput(endDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((appointment) => {
      const appointmentDate = new Date(appointment.start_time);
      return appointmentDate <= end;
    });
  }

  filtered.forEach((appointment) => {
    const responsibleProfessional = getAppointmentResponsibleProfessional(appointment);
    const professionalId = responsibleProfessional.id;
    if (ownerId && professionalId === ownerId) return;

    const current =
      report.get(professionalId) ?? {
        professionalId,
        professionalName: responsibleProfessional.full_name,
        heldClasses: 0,
        paidMisses: 0,
        gross: 0,
        professionalShare: 0,
        commissionPaid: 0,
      };

    const classValue = getCommissionClassValue(appointment);
    if (appointment.status === "presenca_registrada") {
      current.gross += classValue;
      current.professionalShare += classValue * 0.4;
      current.heldClasses += 1;
    } else if (appointment.status === "falta") {
      current.paidMisses += 1;
    }

    report.set(professionalId, current);
  });

  return [...report.values()].sort((a, b) => a.professionalName.localeCompare(b.professionalName));
}

export function buildCommissionDetailReport(appointments, ownerId, startDate, endDate) {
  const dateColumns = new Set(listDateRange(startDate, endDate));
  const rows = new Map();
  const start = parseDateInput(startDate);
  start.setHours(0, 0, 0, 0);
  const end = parseDateInput(endDate);
  end.setHours(23, 59, 59, 999);

  appointments
    .filter((appointment) => isCommissionableAppointment(appointment.status))
    .filter((appointment) => {
      const appointmentDate = new Date(appointment.start_time);
      return appointmentDate >= start && appointmentDate <= end;
    })
    .forEach((appointment) => {
      const responsibleProfessional = getAppointmentResponsibleProfessional(appointment);
      const professionalId = responsibleProfessional.id;
      if (ownerId && professionalId === ownerId) return;

      const appointmentDate = toDateInputValue(new Date(appointment.start_time));
      if (!dateColumns.has(appointmentDate)) return;

      const grossClassValue = getCommissionClassValue(appointment);
      const commissionClassValue = grossClassValue * 0.4;
      const patientId = appointment.patient_id ?? "sem-paciente";
      const packageId = appointment.package_id ?? "sem-pacote";
      const rowKey = [professionalId, patientId, packageId, commissionClassValue.toFixed(2)].join(":");

      const current =
        rows.get(rowKey) ?? {
          professionalId,
          professionalName: responsibleProfessional.full_name,
          patientId,
          patientName: appointment.patients?.full_name ?? "Paciente não informado",
          packageId,
          packageAmount: money(appointment.lesson_packages?.total_amount),
          grossClassValue,
          commissionClassValue,
          contractedLessons: appointment.lesson_packages?.total_lessons ?? 0,
          presenceByDate: {},
          presences: 0,
          totalCommission: 0,
        };

      if (appointment.status === "presenca_registrada") {
        current.presenceByDate[appointmentDate] = (current.presenceByDate[appointmentDate] ?? 0) + 1;
        current.presences += 1;
        current.totalCommission += commissionClassValue;
      }

      rows.set(rowKey, current);
    });

  return [...rows.values()];
}
