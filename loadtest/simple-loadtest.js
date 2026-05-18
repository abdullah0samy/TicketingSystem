/**
 * Lightweight load test using Node.js native fetch (no dependencies).
 * Usage: node loadtest/simple-loadtest.js [concurrency] [duration_seconds]
 * Example: node loadtest/simple-loadtest.js 50 60
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2]) || 50;
const DURATION_SEC = parseInt(process.argv[3]) || 60;

const stats = {
  total: 0,
  ok: 0,
  failed: 0,
  latencies: [],
  startTime: Date.now(),
};

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '1', password: 'password123' }),
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
      { url: `${BASE_URL}/api/analytics/dashboard-summary`, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      { url: `${BASE_URL}/api/tickets/department?page=1&limit=20`, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      { url: `${BASE_URL}/api/tickets/search?q=TKT&limit=5`, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    ];

    const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
    const res = await fetch(ep.url, { method: ep.method, headers: ep.headers || {} });
    const latency = Date.now() - start;

    stats.total++;
    stats.latencies.push(latency);
    if (res.ok) stats.ok++;
    else stats.failed++;
  } catch {
    stats.total++;
    stats.failed++;
  }
}

async function worker(token) {
  while (Date.now() - stats.startTime < DURATION_SEC * 1000) {
    await makeRequest(token);
    await new Promise(r => setTimeout(r, Math.random() * 200 + 50));
  }
}

async function run() {
  console.log(`🚀 Load Test: ${CONCURRENCY} concurrent users for ${DURATION_SEC}s`);
  console.log(`📍 Target: ${BASE_URL}\n`);

  const token = await login();
  if (!token) {
    console.error('❌ Login failed. Check credentials and server.');
    process.exit(1);
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker(token));

  // Print stats every 10 seconds
  const interval = setInterval(() => {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
    const rps = (stats.total / (Date.now() - stats.startTime) * 1000).toFixed(1);
    const p50 = stats.latencies.length > 0
      ? [...stats.latencies].sort((a, b) => a - b)[Math.floor(stats.latencies.length * 0.5)]
      : 0;
    const p95 = stats.latencies.length > 0
      ? [...stats.latencies].sort((a, b) => a - b)[Math.floor(stats.latencies.length * 0.95)]
      : 0;
    const p99 = stats.latencies.length > 0
      ? [...stats.latencies].sort((a, b) => a - b)[Math.floor(stats.latencies.length * 0.99)]
      : 0;

    console.log(`[${elapsed}s] Total: ${stats.total} | OK: ${stats.ok} | Failed: ${stats.failed} | RPS: ${rps} | P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms`);
  }, 10000);

  await Promise.all(workers);
  clearInterval(interval);

  const total = stats.total;
  const ok = stats.ok;
  const failed = stats.failed;
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const rps = (total / (Date.now() - stats.startTime) * 1000).toFixed(1);
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  const avg = sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;

  console.log('\n=== RESULTS ===');
  console.log(`Duration:      ${elapsed}s`);
  console.log(`Concurrency:   ${CONCURRENCY}`);
  console.log(`Total Requests: ${total}`);
  console.log(`Successful:    ${ok} (${(ok / total * 100).toFixed(1)}%)`);
  console.log(`Failed:        ${failed} (${(failed / total * 100).toFixed(1)}%)`);
  console.log(`Throughput:    ${rps} req/s`);
  console.log(`Avg Latency:   ${avg}ms`);
  console.log(`P50 Latency:   ${p50}ms`);
  console.log(`P95 Latency:   ${p95}ms`);
  console.log(`P99 Latency:   ${p99}ms`);

  if (failed / total > 0.01) {
    console.log('\n⚠️  WARNING: Error rate > 1%');
  }
  if (p95 > 500) {
    console.log('\n⚠️  WARNING: P95 latency > 500ms');
  }
}

run().catch(console.error);
