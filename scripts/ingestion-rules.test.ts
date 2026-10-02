import assert from 'node:assert/strict';
import {
  detectActivityCategory,
  getDueDateRange,
  getWorkplanDomain,
  isActionItemText,
  serializeDueDatePeriod,
} from '../src/services/ingestionRules';

assert.equal(isActionItemText('Begin classes on 5 October 2026.'), true);
assert.equal(isActionItemText('Record Monitoring Metric: maintain a 1:25 teacher ratio.'), true);
assert.equal(isActionItemText('Restart feeding programme on 12 October.'), true);
assert.equal(isActionItemText('Work toward the 1:25 teacher/caregiver-to-learner ratio.'), true);
assert.equal(isActionItemText('The team is maintaining a 1:25 teacher/caregiver ratio.'), true);
assert.equal(isActionItemText('Margaret returned to school after completing the term.'), false);
assert.equal(isActionItemText('The girls enjoyed the annual sports day.'), false);
assert.equal(getWorkplanDomain('Maintain a 1:25 teacher/caregiver ratio'), 'Early Years');
assert.equal(getWorkplanDomain('Pitching at business competitions'), 'Business / Entrepreneurship');
assert.equal(getWorkplanDomain('Sports and athletics sessions'), 'Sports / Recreation');
assert.equal(detectActivityCategory('Business competitions and mentorship'), 'Business / Entrepreneurship');
assert.equal(detectActivityCategory('Mentorship programs', 'Bursary – Business & Entrepreneurship'), 'Business / Entrepreneurship');
assert.equal(detectActivityCategory('Football and athletics'), 'Sports / Recreation');
assert.equal(detectActivityCategory('Solar irrigation and gardening'), 'Agriculture / Practical Skills');
assert.equal(detectActivityCategory('Teamwork and leadership'), 'Life Skills');
assert.equal(serializeDueDatePeriod({ type: 'month', value: '2026-10' }), 'month:2026-10');
assert.deepEqual(getDueDateRange('month:2026-02'), { startDate: '2026-02-01', endDate: '2026-02-28' });
assert.deepEqual(getDueDateRange('quarter:2026-Q3'), { startDate: '2026-07-01', endDate: '2026-09-30' });
assert.deepEqual(getDueDateRange('range:2026-10-02/2026-10-12'), { startDate: '2026-10-02', endDate: '2026-10-12' });
assert.equal(getDueDateRange('range:2026-10-12/2026-10-02'), null);

console.log('Ingestion action, domain, category, and due-period tests passed.');
