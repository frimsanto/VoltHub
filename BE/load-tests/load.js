// VoltReport — main k6 load test.
//
// Parameterised by env so the same script drives all three scenarios:
//   Scenario 1:  VUS=50   k6 run load.js
//   Scenario 2:  VUS=100  k6 run load.js
//   Scenario 3:  VUS=200  k6 run load.js
//
// Simulates a realistic read-heavy mix (dashboard, report lists, rekap) that an
// operations team generates, plus a periodic XLSX export. Each VU logs in once
// in setup-per-VU and reuses the token.
//
// Server CPU/memory are NOT measured by k6 (it's a client) — capture them in
// parallel (see README: `docker stats` / `top` / Sentry performance).
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, jsonHeaders, login } from './lib.js';

const VUS = parseInt(__ENV.VUS || '50', 10);
const DURATION = __ENV.DURATION || '1m';
const RAMP = __ENV.RAMP || '20s';

const errorRate = new Trend('business_errors', true);
const failedChecks = new Rate('failed_checks');

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS },          // ramp up
        { duration: DURATION, target: VUS },      // sustained load
        { duration: '10s', target: 0 },           // ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // SLOs — the run is marked failed if any of these is breached.
    http_req_failed: ['rate<0.01'],               // < 1% transport errors
    http_req_duration: ['p(95)<800', 'p(99)<1500'], // p95 < 800ms, p99 < 1.5s
    failed_checks: ['rate<0.02'],                 // < 2% failed assertions
    checks: ['rate>0.98'],
  },
};

// Each VU authenticates once and caches the token.
export function setup() {
  const token = login();
  if (!token) {
    throw new Error('Load test setup failed: could not authenticate. Is the API up and seeded?');
  }
  return { token };
}

export default function (data) {
  const auth = jsonHeaders(data.token);

  group('health', () => {
    const r = http.get(`${BASE_URL}/health`);
    failedChecks.add(!check(r, { 'health 200': (x) => x.status === 200 }));
  });

  group('dashboard', () => {
    const r = http.get(`${BASE_URL}/dashboard`, auth);
    failedChecks.add(!check(r, { 'dashboard ok': (x) => x.status === 200 || x.status === 304 }));
  });

  group('rekap list (paginated)', () => {
    const r = http.get(`${BASE_URL}/rekap?page=1&limit=20`, auth);
    const ok = check(r, { 'rekap 200': (x) => x.status === 200 });
    failedChecks.add(!ok);
    if (!ok) errorRate.add(r.timings.duration);
  });

  group('laporan-awal list', () => {
    const r = http.get(`${BASE_URL}/laporan-awal?page=1&limit=10`, auth);
    failedChecks.add(!check(r, { 'laporan list 200': (x) => x.status === 200 }));
  });

  // ~10% of iterations also trigger an XLSX export (heavier path).
  if (Math.random() < 0.1) {
    group('rekap export (xlsx)', () => {
      const r = http.get(`${BASE_URL}/rekap/export`, auth);
      failedChecks.add(!check(r, { 'export 200': (x) => x.status === 200 }));
    });
  }

  sleep(Math.random() * 2 + 1); // 1–3s think time per virtual user
}
