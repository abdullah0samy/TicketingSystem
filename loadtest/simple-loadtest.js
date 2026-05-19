/**
 * Production-grade load test using Node.js native fetch (no dependencies).
 * - Per-worker login (each virtual user authenticates independently)
 * - Rate-limit aware (reads Retry-After, back off, classifies 429 separately)
 * - Per-endpoint latency breakdown
 * - Configurable via env vars
 *
 * Usage:
 *   node loadtest/simple-loadtest.js [concurrency] [duration_seconds]
 *   BASE_URL=https://ticket-dev.abchospitaleg.com node loadtest/simple-loadtest.js 20 60
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2]) || 20;
const DURATION_SEC = parseInt(process.argv[3]) || 60;
const LOGIN_ID = process.env.LOGIN_ID || '00001';
const LOGIN_PASS = process.env.LOGIN_PASS || 'Admin@123';

const stats = {
  total: 0, ok: 0, failed: 0, rateLimited: 0, authFailed: 0,
  byEndpoint: {},
  latencies: [],
  startTime: Date.now(),
};

function trackEndpoint(method, url, latency, status) {
  const key = `${method} ${new URL(url, BASE_URL).pathname}`;
  if (!stats.byEndpoint[key]) stats.byEndpoint[key] = { count: 0, ok: 0, fails: 0, latencies: [] };
  const ep = stats.byEndpoint[key];
  ep.count++;
  ep.latencies.push(latency);
  if (status >= 200 && status < 300) ep.ok++;
  else ep.fails++;
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: LOGIN_ID, password: LOGIN_PASS }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.accessToken;
}

async function makeRequest(token) {
  const start = Date.now();
  try {
    const endpoints = [
      { url: `${BASE_URL}/api/health`, method: 'GET' },
      { url: `${BASE_URL}/api/analytics/dashboard-summary`, method: 'GET', auth: true },
      { url: `${BASE_URL}/api/tickets/department?page=1&limit=20`, method: 'GET', auth: true },
      { url: `${BASE_URL}/api/tickets/search?q=TKT&limit=5`, method: 'GET', auth: true },
    ];

    const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
    const headers = {};
    if (ep.auth && token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(ep.url, { method: ep.method, headers });
    const latency = Date.now() - start;

    stats.total++;
    stats.latencies.push(latency);
    trackEndpoint(ep.method, ep.url, latency, res.status);

    if (res.status === 429) {
      stats.rateLimited++;
      stats.failed++;
      const retryAfter = parseInt(res.headers.get('retry-after') || '5');
      return retryAfter * 1000; // return backoff duration
    }

    if (res.ok) stats.ok++;
    else {
      stats.failed++;
      if (res.status === 401) stats.authFailed++;
    }
  } catch {
    stats.total++;
    stats.failed++;
  }
  return 0; // no backoff
}

async function worker() {
  const token = await login();
  if (!token) {
    stats.authFailed++;
    return;
  }

  while (Date.now() - stats.startTime < DURATION_SEC * 1000) {
    const backoff = await makeRequest(token);
    await new Promise(r => setTimeout(r, backoff || (Math.random() * 400 + 100)));
  }
}

function percentile(sorted, pct) {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length * pct)] || 0;
}

async function run() {
  console.log(`Load Test: ${CONCURRENCY} concurrent users for ${DURATION_SEC}s`);
  console.log(`Target: ${BASE_URL}\n`);

  const workers = Array.from({ length: CONCURRENCY }, () => worker());

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
    const rps = (stats.total / (Date.now() - stats.startTime) * 1000).toFixed(1);
    const sorted = [...stats.latencies].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const p99 = percentile(sorted, 0.99);

    console.log(`[${elapsed}s] Req:${stats.total} OK:${stats.ok} 429:${stats.rateLimited} Fail:${stats.failed - stats.rateLimited} RPS:${rps} P50:${p50}ms P95:${p95}ms P99:${p99}ms`);
  }, 10000);

  await Promise.all(workers);
  clearInterval(interval);

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const rps = (stats.total / (Date.now() - stats.startTime) * 1000).toFixed(1);
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const p99 = percentile(sorted, 0.99);
  const avg = sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;

  console.log('\n=== RESULTS ===');
  console.log(`Duration:        ${elapsed}s`);
  console.log(`Concurrency:     ${CONCURRENCY}`);
  console.log(`Total Requests:  ${stats.total}`);
  console.log(`Successful:      ${stats.ok} (${(stats.ok / stats.total * 100).toFixed(1)}%)`);
  console.log(`Rate Limited:    ${stats.rateLimited} (${(stats.rateLimited / stats.total * 100).toFixed(1)}%)`);
  console.log(`Auth Failed:     ${stats.authFailed}`);
  console.log(`Other Failed:    ${stats.failed - stats.rateLimited - stats.authFailed}`);
  console.log(`Throughput:      ${rps} req/s`);
  console.log(`Avg Latency:     ${avg}ms`);
  console.log(`P50 Latency:     ${p50}ms`);
  console.log(`P95 Latency:     ${p95}ms`);
  console.log(`P99 Latency:     ${p99}ms`);

  console.log('\n--- Per-Endpoint Breakdown ---');
  for (const [ep, data] of Object.entries(stats.byEndpoint)) {
    const epSorted = data.latencies.sort((a, b) => a - b);
    const epP50 = percentile(epSorted, 0.5);
    const epP95 = percentile(epSorted, 0.95);
    console.log(`${ep}: ${data.count} req, ${data.ok} OK, ${data.fails} fail, P50 ${epP50}ms, P95 ${epP95}ms`);
  }

  const errors = stats.failed - stats.rateLimited;
  if (errors / stats.total > 0.01) {
    console.log('\nWARNING: Non-429 error rate > 1% — investigate server errors');
  }
  if (p95 > 500) {
    console.log('\nWARNING: P95 latency > 500ms');
  }
}

run().catch(console.error);
