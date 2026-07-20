import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommissionReport } from '../src/lib/commission.js';

test('only presence-registered lessons contribute to commission values', () => {
  const appointments = [
    {
      id: '1',
      patient_id: 'p1',
      package_id: 'pkg1',
      start_time: '2026-07-01T10:00:00.000Z',
      status: 'presenca_registrada',
      class_price: 100,
      patients: null,
      profiles: { id: 'physio-1', full_name: 'Ana' },
      lesson_packages: {
        total_lessons: 4,
        lesson_value: 100,
        procedure_amount: 0,
        total_amount: 400,
      },
    },
    {
      id: '2',
      patient_id: 'p2',
      package_id: 'pkg2',
      start_time: '2026-07-02T10:00:00.000Z',
      status: 'falta',
      class_price: 100,
      patients: null,
      profiles: { id: 'physio-1', full_name: 'Ana' },
      lesson_packages: {
        total_lessons: 4,
        lesson_value: 100,
        procedure_amount: 0,
        total_amount: 400,
      },
    },
    {
      id: '3',
      patient_id: 'p3',
      package_id: 'pkg3',
      start_time: '2026-07-03T10:00:00.000Z',
      status: 'cancelada',
      class_price: 100,
      patients: null,
      profiles: { id: 'physio-1', full_name: 'Ana' },
      lesson_packages: {
        total_lessons: 4,
        lesson_value: 100,
        procedure_amount: 0,
        total_amount: 400,
      },
    },
  ];

  const report = buildCommissionReport(appointments, null);

  assert.equal(report.length, 1);
  assert.equal(report[0].heldClasses, 1);
  assert.equal(report[0].paidMisses, 1);
  assert.equal(report[0].gross, 100);
  assert.equal(report[0].professionalShare, 40);
});
