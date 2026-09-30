# OutageOps

> Real-Time SRE Incident Response War-Room & Distributed Runbook Coordinator

OutageOps is an operational dashboard designed for high-severity production outage triage (P0/P1 incidents). It combines a high-throughput micro-batched telemetry stream, distributed runbook task locking (mutex), live event-sourced audit logs, team chat, and one-click post-mortem exports.

---

## Architecture Overview

```
                      +-----------------------------+
                      |   Chaos Failure Simulator   |
                      |       (simulator.js)        |
                      +--------------+--------------+
                                     |
                                     | HTTP POST (10-30 logs/sec)
                                     v
                      +-----------------------------+
                      |      Express + WS Core      |
                      |   - Micro-Batcher (50ms)    |
                      |   - Runbook Mutex / State   |
                      |   - Event Timeline Store    |
                      +--------------+--------------+
                                     |
                                     | WebSocket Broadcast
                                     v
                      +-----------------------------+
                      |      React War-Room UI      |
                      |   - High-FPS Log Terminal   |
                      |   - Collaborative Runbook   |
                      |   - Live Timeline & Chat    |
                      |   - Post-Mortem Exporter    |
                      +-----------------------------+
```

---

## Features

- **Micro-Batched Telemetry Engine**: Buffers incoming high-volume microservice logs in 50ms windows, preventing browser DOM lockups and sustaining 60 FPS under heavy failure storms.
- **Concurrent Runbook with Mutex Locks**: Prevents split-brain remediation during an outage by allowing SREs to claim and lock operational tasks.
- **Event-Sourced Timeline**: Automatically logs system alerts, runbook claim/completion events, and team communications with precise timestamps.
- **Multi-Responder Simulation**: Switch between user personas (*Lead SRE*, *DBA*, *DevOps Bot*) to test distributed lock conflicts and collaboration.
- **Automated Post-Mortem Generator**: Generates and downloads an incident report in Markdown with one click.
- **Built-in Chaos Failure Simulator**: Generates cascading service failures (PostgreSQL connection exhaustion, HTTP 504 gateway timeouts, Redis deadlocks).

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### 1. Install & Start Backend
```bash
cd backend
npm install
npm start
```
*Backend runs on `http://localhost:4000` with WebSocket support.*

### 2. Install & Start Frontend
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`.*

### 3. Launch Chaos Simulator (Optional)
To test high-frequency log ingestion and simulated failure storms:
```bash
cd backend
npm run simulate
```

---

## License
MIT
