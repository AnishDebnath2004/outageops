import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ==========================================
// 1. In-Memory State & Incident Event Store
// ==========================================
let sequenceCounter = 0;
let logBuffer = [];
const BATCH_INTERVAL_MS = 50;

const incidentState = {
  id: "INC-8921",
  title: "Critical: Database Connection Pool Exhaustion & Gateway 504s",
  severity: "P1 - CRITICAL",
  startedAt: new Date().toISOString(),
  commander: "Anish (Lead SRE)",
  status: "INVESTIGATING",
  runbook: [
    { id: 1, title: "Isolate Failing Read Replicas", status: "PENDING", lockedBy: null, lockedAt: null },
    { id: 2, title: "Scale Connection Pool Limit in PgBouncer", status: "PENDING", lockedBy: null, lockedAt: null },
    { id: 3, title: "Flush Redis Stale Cache Keys", status: "PENDING", lockedBy: null, lockedAt: null },
    { id: 4, title: "Verify Latency & Drop Error Rate below 1%", status: "PENDING", lockedBy: null, lockedAt: null },
    { id: 5, title: "Promote Standby Master if Primary Unresponsive", status: "PENDING", lockedBy: null, lockedAt: null }
  ],
  timeline: [
    {
      id: "ev-1",
      timestamp: new Date().toISOString(),
      user: "System Watchdog",
      message: "Automated alert triggered: Error rate spiked past 18.4%"
    }
  ]
};

// ==========================================
// 2. Broadcast Helper
// ==========================================
function broadcast(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// ==========================================
// 3. Micro-Batching Log Engine (50ms interval)
// ==========================================
setInterval(() => {
  if (logBuffer.length === 0) return;

  const batchToSend = [...logBuffer];
  logBuffer = [];

  broadcast({
    type: "LOG_BATCH",
    batch: batchToSend
  });
}, BATCH_INTERVAL_MS);

// ==========================================
// 4. Ingestion Endpoint for Service Logs
// ==========================================
app.post('/api/logs', (req, res) => {
  const { service, level, message } = req.body;
  if (!service || !message) {
    return res.status(400).json({ error: "Missing service or message" });
  }

  sequenceCounter += 1;
  const logEntry = {
    seq_id: sequenceCounter,
    timestamp: new Date().toISOString(),
    service,
    level: level || "INFO",
    message
  };

  logBuffer.push(logEntry);
  res.status(202).json({ status: "buffered", seq_id: sequenceCounter });
});

// ==========================================
// 5. REST Status Snapshot
// ==========================================
app.get('/api/incident', (req, res) => {
  res.json(incidentState);
});

// ==========================================
// 6. WebSocket Connection Handling
// ==========================================
wss.on('connection', (ws) => {
  // Send current state on connection
  ws.send(JSON.stringify({
    type: "INIT_STATE",
    data: incidentState
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      // Handle step locking / claiming (Concurrency control)
      if (msg.type === "CLAIM_STEP") {
        const step = incidentState.runbook.find(s => s.id === msg.stepId);
        if (!step) return;

        // Mutex check: Can only claim if not locked by someone else
        if (step.lockedBy && step.lockedBy !== msg.user) {
          ws.send(JSON.stringify({
            type: "LOCK_ERROR",
            message: `Step ${step.id} is currently locked by ${step.lockedBy}`
          }));
          return;
        }

        step.lockedBy = msg.user;
        step.lockedAt = new Date().toISOString();
        step.status = "IN_PROGRESS";

        incidentState.timeline.unshift({
          id: `ev-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: msg.user,
          message: `Claimed step: "${step.title}"`
        });

        broadcast({ type: "STATE_UPDATED", data: incidentState });
      }

      // Handle step completion
      if (msg.type === "COMPLETE_STEP") {
        const step = incidentState.runbook.find(s => s.id === msg.stepId);
        if (!step) return;

        step.status = "COMPLETED";
        step.lockedBy = null;

        incidentState.timeline.unshift({
          id: `ev-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: msg.user,
          message: `Completed step: "${step.title}"`
        });

        // Check if all steps completed
        const allDone = incidentState.runbook.every(s => s.status === "COMPLETED");
        if (allDone) {
          incidentState.status = "RESOLVED";
          incidentState.timeline.unshift({
            id: `ev-${Date.now()}-res`,
            timestamp: new Date().toISOString(),
            user: "System",
            message: "Incident marked as RESOLVED. Ready for post-mortem export."
          });
        }

        broadcast({ type: "STATE_UPDATED", data: incidentState });
      }

      // Handle incident war-room chat
      if (msg.type === "SEND_CHAT") {
        const event = {
          id: `ev-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: msg.user,
          message: msg.text
        };
        incidentState.timeline.unshift(event);
        broadcast({ type: "TIMELINE_EVENT", event });
      }
    } catch (err) {
      console.error("WS Parse error:", err);
    }
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`[OutageOps Core] Running on http://localhost:${PORT}`);
  console.log(`[WebSocket Server] Ready for war-room connections`);
});