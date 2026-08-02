// Shared helpers for the VoltReport k6 load tests.
import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

// Seeded demo credentials (override via env for a real test account).
export const CREDS = {
  email: __ENV.LOAD_EMAIL || 'admin@voltreport.com',
  password: __ENV.LOAD_PASSWORD || 'password123',
};

export function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return { headers: h };
}

// Logs in once and returns an access token (or null on failure).
export function login() {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(CREDS), jsonHeaders());
  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login returned token': (r) => {
      try {
        return !!r.json('data.tokens.accessToken');
      } catch {
        return false;
      }
    },
  });
  if (!ok) return null;
  return res.json('data.tokens.accessToken');
}
