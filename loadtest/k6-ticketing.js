import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// === CONFIGURATION ===
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(__ENV.CONCURRENCY || '50');
const DURATION = __ENV.DURATION || '2m';

export const options = {
  stages: [
    { duration: '30s', target: CONCURRENCY },      // Ramp up
    { duration: DURATION, target: CONCURRENCY },   // Steady state
    { duration: '30s', target: 0 },                 // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],               // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'],                 // Error rate < 1%
    errors: ['rate<0.05'],                          // Custom error rate < 5%
  },
};

// === SCENARIO: Realistic Ticketing Workflow ===

// 1. Login
function login() {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    identifier: '1',
    password: 'password123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login returns accessToken': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.accessToken;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    errorRate.add(1);
    return null;
  }

  return JSON.parse(res.body).accessToken;
}

// 2. Get Dashboard Summary
function getDashboard(token) {
  const res = http.get(`${BASE_URL}/api/analytics/dashboard-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'dashboard 200': (r) => r.status === 200 }) || errorRate.add(1);
  return res;
}

// 3. List Department Tickets
function listTickets(token) {
  const res = http.get(`${BASE_URL}/api/tickets/department?page=1&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'list tickets 200': (r) => r.status === 200 }) || errorRate.add(1);
  return res;
}

// 4. Create Ticket
function createTicket(token) {
  const res = http.post(`${BASE_URL}/api/tickets`, JSON.stringify({
    subject: `Load Test Ticket ${Date.now()}`,
    description: 'This is a load test ticket. It will be cleaned up.',
    departmentId: '1',
    priority: 'normal',
  }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  check(res, { 'create ticket 201': (r) => r.status === 201 }) || errorRate.add(1);
  return res;
}

// 5. Search Tickets
function searchTickets(token) {
  const res = http.get(`${BASE_URL}/api/tickets/search?q=TKT&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(res, { 'search 200': (r) => r.status === 200 }) || errorRate.add(1);
}

// 6. Health Check
function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, { 'health ok': (r) => r.status === 200 }) || errorRate.add(1);
}

// === MAIN EXECUTION ===
export default function () {
  const token = login();
  if (!token) {
    sleep(1);
    return;
  }

  // Simulate realistic user behavior with weighted operations
  const rand = Math.random();

  if (rand < 0.15) {
    healthCheck();                                    // 15% health checks
  } else if (rand < 0.40) {
    getDashboard(token);                              // 25% dashboard views
  } else if (rand < 0.70) {
    listTickets(token);                               // 30% ticket listing
  } else if (rand < 0.85) {
    searchTickets(token);                             // 15% searches
  } else {
    createTicket(token);                              // 15% ticket creation
  }

  sleep(Math.random() * 2 + 0.5);                     // 0.5-2.5s between actions
}
