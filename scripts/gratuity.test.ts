import assert from 'node:assert/strict';
import { calculateGratuity } from '../src/services/gratuityService';

const employee = (category: 'Ground Worker/Gardener' | 'Other Staff') => ({
  id: 'staff-1',
  employeeCategory: category,
  contractStartDate: '2026-01-01',
});

const salary = (effectiveDate: string, salaryAmount: number, salaryFrequency: 'Monthly' | 'Weekly' | 'Daily' | 'Annual' = 'Monthly') => ({
  effectiveDate,
  salaryAmount,
  salaryFrequency,
});

assert.equal(calculateGratuity(employee('Other Staff'), '2027-01-01', [salary('2026-01-01', 100000)]).totalGratuity, 120000);
assert.equal(calculateGratuity(employee('Ground Worker/Gardener'), '2027-01-01', [salary('2026-01-01', 100000)]).totalGratuity, 60000);
assert.equal(calculateGratuity(employee('Other Staff'), '2027-01-01', [
  salary('2026-01-01', 100000),
  salary('2026-07-01', 120000),
]).totalGratuity, 132000);
assert.equal(calculateGratuity(employee('Ground Worker/Gardener'), '2027-01-01', [
  salary('2026-01-01', 100000),
  salary('2026-07-01', 120000),
]).totalGratuity, 66000);
assert.equal(calculateGratuity(employee('Other Staff'), '2026-02-01', [salary('2026-01-01', 70000, 'Weekly')]).totalGratuity, 31000);
assert.equal(calculateGratuity(employee('Other Staff'), '2026-02-01', [salary('2026-01-01', 10000, 'Daily')]).totalGratuity, 31000);
assert.equal(calculateGratuity(employee('Other Staff'), '2026-02-01', [salary('2026-01-01', 3650000, 'Annual')]).totalGratuity, 31000);

const midMonthContract = { ...employee('Other Staff'), contractStartDate: '2026-01-15' };
assert.equal(
  calculateGratuity(midMonthContract, '2026-02-15', [salary('2026-01-15', 100000)]).totalGratuity,
  10000,
  'one contract-anniversary month should accrue exactly one monthly salary times the gratuity rate',
);
const midContractSalaryChange = calculateGratuity(midMonthContract, '2026-02-15', [
  salary('2026-01-15', 100000),
  salary('2026-02-01', 200000),
]);
assert.ok(
  Math.abs(midContractSalaryChange.totalGratuity - (4500000 / 31 * 0.1)) < 0.001,
  'salary changes within a contract-anniversary month should be prorated across that same month',
);
assert.equal(
  calculateGratuity({ ...employee('Other Staff'), contractStartDate: '2026-01-31' }, '2026-02-28', [
    salary('2026-01-31', 100000),
  ]).totalGratuity,
  10000,
  'month-end contracts should use the clamped calendar anniversary',
);

const midMonthChange = calculateGratuity(employee('Other Staff'), '2026-02-01', [
  salary('2026-01-01', 100000),
  salary('2026-01-16', 200000),
]);
assert.ok(Math.abs(midMonthChange.totalGratuity - 15161.29032258) < 0.001);
assert.equal(midMonthChange.salaryPeriods.reduce((total, period) => total + period.months, 0), 1);

assert.equal(calculateGratuity(employee('Other Staff'), '2026-07-01', []).employmentMonths, 6);
assert.equal(calculateGratuity(employee('Other Staff'), '2026-07-01', [salary('2026-01-01', 100000)]).totalGratuity, 60000);
assert.throws(() => calculateGratuity(employee('Other Staff'), '2026-02-31', [salary('2026-01-01', 100000)]));
assert.throws(() => calculateGratuity(employee('Other Staff'), '2026-01-01', [salary('2026-01-01', 0)]));
assert.throws(() => calculateGratuity(employee('Other Staff'), '2025-12-31', [salary('2026-01-01', 100000)]));
assert.throws(() => calculateGratuity(employee('Other Staff'), '2026-03-01', [salary('2026-01-02', 100000)]), /on or before the contract start date/);

const rehireSalary = [
  { ...salary('2026-01-01', 100000), employmentPeriodId: 'period-1' },
  { ...salary('2027-01-01', 200000), employmentPeriodId: 'period-2' },
];
assert.equal(calculateGratuity({ ...employee('Other Staff'), employmentPeriodId: 'period-1' }, '2026-07-01', rehireSalary).totalGratuity, 60000);
assert.equal(calculateGratuity({ ...employee('Other Staff'), contractStartDate: '2027-01-01', employmentPeriodId: 'period-2' }, '2027-07-01', rehireSalary).totalGratuity, 120000);

console.log('Gratuity calculation tests passed.');
