import assert from 'node:assert/strict';
import { isAdminEmailAddress } from '../lib/admin/allowlist.ts';
import {
  createWorkerLogQuery,
  parseWorkerLogFilters,
  WORKER_LOG_PAGE_SIZE,
} from '../lib/admin/observability-query.ts';

assert.equal(isAdminEmailAddress(' ADMIN@example.com ', 'admin@example.com, owner@example.com'), true);
assert.equal(isAdminEmailAddress('outsider@example.com', 'admin@example.com, owner@example.com'), false);
assert.equal(isAdminEmailAddress('admin@example.com', undefined), false);

const defaultFilters = parseWorkerLogFilters(new URLSearchParams());
assert.ok(defaultFilters);
assert.deepEqual(defaultFilters, { range: '7d', level: 'all', search: '', cursor: null });
assert.equal(parseWorkerLogFilters(new URLSearchParams('range=constructor')), null);
assert.equal(parseWorkerLogFilters(new URLSearchParams('level=trace')), null);
assert.equal(parseWorkerLogFilters(new URLSearchParams(`search=${'x'.repeat(101)}`)), null);
assert.equal(parseWorkerLogFilters(new URLSearchParams(`cursor=${'x'.repeat(257)}`)), null);

const filters = parseWorkerLogFilters(new URLSearchParams(
  'range=24h&level=error&search=timeout&cursor=event-50',
));
assert.ok(filters);
const now = 1_800_000_000_000;
const query = createWorkerLogQuery(filters, now);
assert.equal(query.limit, WORKER_LOG_PAGE_SIZE);
assert.equal(query.view, 'events');
assert.deepEqual(query.timeframe, { from: now - 24 * 60 * 60 * 1000, to: now });
assert.equal(query.offset, 'event-50');
assert.equal(query.offsetDirection, 'next');
assert.deepEqual(query.needle, { value: 'timeout', isRegex: false, matchCase: false });
assert.deepEqual(query.parameters.datasets, ['cloudflare-workers']);
assert.deepEqual(query.parameters.filters, [
  { key: '$metadata.service', operation: 'eq', type: 'string', value: 'rungset' },
  { key: '$metadata.level', operation: 'eq', type: 'string', value: 'error' },
]);

console.log('Admin query and allowlist tests passed.');
