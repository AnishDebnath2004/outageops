// Simulates a catastrophic cascading failure across services
const SERVICES = ["api-gateway", "auth-service", "postgres-master", "redis-cluster", "billing-worker"];
const LEVELS = ["INFO", "WARN", "ERROR", "FATAL"];

const ERROR_TEMPLATES = [
  "Connection pool exhausted: max active 100/100 reached",
  "HTTP 504 Gateway Timeout while proxying to /v1/checkout",
  "Deadlock detected on table 'accounts_ledger' for tx_id 98402",
  "Redis command timed out after 2000ms: ETIMEDOUT",
  "Disk I/O wait spike: 98% utilization on /var/lib/postgresql/data",
  "CPU throttling threshold exceeded (99.8%) on container pod-auth-9x8",
  "Heartbeat check missed for replica node db-replica-02"
];

const NORMAL_TEMPLATES = [
  "Health probe OK: 200 latency=12ms",
  "Handling request GET /api/v2/metrics",
  "Cache hit for user session key: usr_8921",
  "Worker heartbeat acknowledged"
];

async function sendLog(service, level, message) {
  try {
    await fetch('http://localhost:4000/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, level, message })
    });
  } catch (err) {
    // Ignore server restart hiccups
  }
}

console.log("=== OutageOps Simulator Started: Generating High-Frequency Incidents ===");

// Emits 10-30 logs per second to test client batching and throughput
setInterval(() => {
  const isError = Math.random() < 0.45; // 45% error rate during outage
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  const level = isError 
    ? (Math.random() < 0.3 ? "FATAL" : "ERROR") 
    : (Math.random() < 0.2 ? "WARN" : "INFO");
    
  const message = isError 
    ? ERROR_TEMPLATES[Math.floor(Math.random() * ERROR_TEMPLATES.length)]
    : NORMAL_TEMPLATES[Math.floor(Math.random() * NORMAL_TEMPLATES.length)];

  sendLog(service, level, message);
}, 40);