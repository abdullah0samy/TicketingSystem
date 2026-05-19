import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(__ENV.CONCURRENCY || '20');
const DURATION = __ENV.DURATION || '2m';
const LOGIN_ID = __ENV.LOGIN_ID || '00001';
const LOGIN_PASS = __ENV.LOGIN_PASS || 'Admin@123';

export const options = {
  stages: [
    { duration: '30s', target: CONCURRENCY },
    { duration: DURATION, target: CONCURRENCY },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
  },
  noConnectionReuse: true,
};

// Login once in setup, token reused by all VUs for the test duration
export function setup() {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    identifier: LOGIN_ID, password: LOGIN_PASS,
  }), { headers: { 'Content-Type': 'application/json' } });

  if (res.status !== 200) {
    throw new Error(`Setup login failed: ${res.status} ${res.body}`);
  }
  const body = JSON.parse(res.body);
  return { accessToken: body.accessToken };
}

function getDashboard(token) {
  const res = http.get(`${BASE_URL}/api/analytics/dashboard-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'dashboard 200': (r) => r.status === 200 }) || errorRate.add(1);
}

function listTickets(token) {
  const res = http.get(`${BASE_URL}/api/tickets/department?page=1&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'list tickets 200': (r) => r.status === 200 }) || errorRate.add(1);
}

function searchTickets(token) {
  const res = http.get(`${BASE_URL}/api/tickets/search?q=TKT&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'search 200': (r) => r.status === 200 }) || errorRate.add(1);
}

function createTicket(token) {
  const res = http.post(`${BASE_URL}/api/tickets`, JSON.stringify({
    subject: `k6 Load Test ${Date.now()}`,
    description: 'Load test ticket',
    departmentId: '1',
    priority: 'normal',
  }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  check(res, { 'create ticket 201': (r) => r.status === 201 }) || errorRate.add(1);
}

function healthCheck() {
  http.get(`${BASE_URL}/api/health`);
}

export default function (data) {
  const token = data.accessToken;

  const rand = Math.random();
  if (rand < 0.15) {
    healthCheck();
  } else if (rand < 0.40) {
    getDashboard(token);
  } else if (rand < 0.70) {
    listTickets(token);
  } else if (rand < 0.85) {
    searchTickets(token);
  } else {
    createTicket(token);
  }

  sleep(Math.random() * 2 + 0.5);
}
