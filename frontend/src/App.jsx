import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, CheckCircle2, Terminal, ShieldAlert, 
  Send, Users, Lock, Clock, Filter, Download, Zap, Radio
} from 'lucide-react';

const DEFAULT_INCIDENT = {
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

const DEMO_SERVICES = ["api-gateway", "auth-service", "postgres-master", "redis-cluster", "billing-worker"];
const DEMO_ERRORS = [
  "Connection pool exhausted: max active 100/100 reached",
  "HTTP 504 Gateway Timeout while proxying to /v1/checkout",
  "Deadlock detected on table 'accounts_ledger' for tx_id 98402",
  "Redis command timed out after 2000ms: ETIMEDOUT",
  "Disk I/O wait spike: 98% utilization on /var/lib/postgresql/data",
  "CPU throttling threshold exceeded (99.8%) on container pod-auth-9x8",
  "Heartbeat check missed for replica node db-replica-02"
];
const DEMO_NORMALS = [
  "Health probe OK: 200 latency=12ms",
  "Handling request GET /api/v2/metrics",
  "Cache hit for user session key: usr_8921",
  "Worker heartbeat acknowledged"
];

export default function App() {
  const [currentUser, setCurrentUser] = useState("Anish (Lead SRE)");
  const [incident, setIncident] = useState(DEFAULT_INCIDENT);
  const [logs, setLogs] = useState([]);
  const [filterLevel, setFilterLevel] = useState("ALL");
  const [chatInput, setChatInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [logThroughput, setLogThroughput] = useState(0);

  const socketRef = useRef(null);
  const logTerminalRef = useRef(null);
  const throughputCounter = useRef(0);
  const simSequenceRef = useRef(1);

  // 1. WebSocket Setup with Environment Variable Support
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      try {
        const defaultProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const defaultHost = window.location.hostname === 'localhost' 
          ? 'localhost:4000' 
          : window.location.hostname.includes('vercel.app')
          ? 'outageops.onrender.com'
          : window.location.host;
        const wsUrl = import.meta.env.VITE_WS_URL || `${defaultProtocol}//${defaultHost}`;
        
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Try reconnecting after 5 seconds if running locally or configured
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === "INIT_STATE") {
              setIncident(msg.data);
            } else if (msg.type === "STATE_UPDATED") {
              setIncident(msg.data);
            } else if (msg.type === "TIMELINE_EVENT") {
              setIncident(prev => prev ? {
                ...prev,
                timeline: [msg.event, ...prev.timeline]
              } : prev);
            } else if (msg.type === "LOG_BATCH") {
              throughputCounter.current += msg.batch.length;
              setLogs(prev => [...prev, ...msg.batch].slice(-500));
            } else if (msg.type === "LOCK_ERROR") {
              alert(msg.message);
            }
          } catch (e) {
            console.error("Failed to parse WS message:", e);
          }
        };
      } catch (err) {
        setIsConnected(false);
      }
    };

    connectWebSocket();

    // Calculate logs per second throughput
    const throughputInterval = setInterval(() => {
      setLogThroughput(throughputCounter.current);
      throughputCounter.current = 0;
    }, 1000);

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(throughputInterval);
    };
  }, []);

  // 2. Client-Side Simulation Fallback when WS is not connected (e.g. Vercel Preview)
  useEffect(() => {
    if (isConnected) return;

    // Simulate logs at 10-20/sec so users immediately see the dashboard alive
    const simInterval = setInterval(() => {
      const batchSize = Math.floor(Math.random() * 3) + 1;
      const newLogs = [];

      for (let i = 0; i < batchSize; i++) {
        simSequenceRef.current += 1;
        const isError = Math.random() < 0.45;
        const service = DEMO_SERVICES[Math.floor(Math.random() * DEMO_SERVICES.length)];
        const level = isError 
          ? (Math.random() < 0.3 ? "FATAL" : "ERROR") 
          : (Math.random() < 0.2 ? "WARN" : "INFO");
        const message = isError 
          ? DEMO_ERRORS[Math.floor(Math.random() * DEMO_ERRORS.length)]
          : DEMO_NORMALS[Math.floor(Math.random() * DEMO_NORMALS.length)];

        newLogs.push({
          seq_id: simSequenceRef.current,
          timestamp: new Date().toISOString(),
          service,
          level,
          message
        });
      }

      throughputCounter.current += newLogs.length;
      setLogs(prev => [...prev, ...newLogs].slice(-500));
    }, 120);

    return () => clearInterval(simInterval);
  }, [isConnected]);

  // 3. Auto-scroll terminal
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Actions
  const claimStep = (stepId) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "CLAIM_STEP",
        stepId,
        user: currentUser
      }));
    } else {
      // Local fallback for standalone demo / Vercel preview
      setIncident(prev => {
        if (!prev) return prev;
        const step = prev.runbook.find(s => s.id === stepId);
        if (!step) return prev;
        if (step.lockedBy && step.lockedBy !== currentUser) {
          alert(`Step ${step.id} is currently locked by ${step.lockedBy}`);
          return prev;
        }
        const updatedRunbook = prev.runbook.map(s => s.id === stepId ? {
          ...s,
          lockedBy: currentUser,
          lockedAt: new Date().toISOString(),
          status: "IN_PROGRESS"
        } : s);
        return {
          ...prev,
          runbook: updatedRunbook,
          timeline: [
            {
              id: `ev-${Date.now()}`,
              timestamp: new Date().toISOString(),
              user: currentUser,
              message: `Claimed step: "${step.title}"`
            },
            ...prev.timeline
          ]
        };
      });
    }
  };

  const completeStep = (stepId) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "COMPLETE_STEP",
        stepId,
        user: currentUser
      }));
    } else {
      // Local fallback for standalone demo / Vercel preview
      setIncident(prev => {
        if (!prev) return prev;
        const step = prev.runbook.find(s => s.id === stepId);
        if (!step) return prev;
        const updatedRunbook = prev.runbook.map(s => s.id === stepId ? {
          ...s,
          lockedBy: null,
          status: "COMPLETED"
        } : s);
        const allDone = updatedRunbook.every(s => s.status === "COMPLETED");
        const timelineEntries = [
          {
            id: `ev-${Date.now()}`,
            timestamp: new Date().toISOString(),
            user: currentUser,
            message: `Completed step: "${step.title}"`
          }
        ];
        if (allDone) {
          timelineEntries.unshift({
            id: `ev-${Date.now()}-res`,
            timestamp: new Date().toISOString(),
            user: "System",
            message: "Incident marked as RESOLVED. Ready for post-mortem export."
          });
        }
        return {
          ...prev,
          status: allDone ? "RESOLVED" : prev.status,
          runbook: updatedRunbook,
          timeline: [...timelineEntries, ...prev.timeline]
        };
      });
    }
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "SEND_CHAT",
        user: currentUser,
        text: chatInput
      }));
    } else {
      // Local fallback
      const event = {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: currentUser,
        message: chatInput
      };
      setIncident(prev => prev ? {
        ...prev,
        timeline: [event, ...prev.timeline]
      } : prev);
    }
    setChatInput("");
  };

  const exportPostMortem = () => {
    if (!incident) return;
    const content = `# Incident Post-Mortem: ${incident.title}
**ID:** ${incident.id}
**Severity:** ${incident.severity}
**Started At:** ${incident.startedAt}
**Status:** ${incident.status}

## Incident Runbook Executions
${incident.runbook.map(s => `- [${s.status === 'COMPLETED' ? 'X' : ' '}] ${s.title} (${s.lockedBy || 'Unassigned'})`).join('\n')}

## Timeline of Events
${incident.timeline.map(t => `[${t.timestamp}] **${t.user}**: ${t.message}`).join('\n')}
`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Post-Mortem-${incident.id}.md`;
    a.click();
  };

  const filteredLogs = logs.filter(l => filterLevel === "ALL" || l.level === filterLevel);

  return (
    <div className="flex flex-col h-screen overflow-hidden font-mono bg-slate-950 text-slate-200">
      {/* Top Banner / War-Room Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-rose-500 font-black tracking-widest text-lg">
            <ShieldAlert className="animate-pulse" /> OUTAGEOPS
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
            {incident?.severity || "P1"}
          </span>
          <h1 className="text-sm font-semibold truncate max-w-xl text-slate-100">
            {incident?.id}: {incident?.title}
          </h1>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-ping' : 'bg-cyan-400'}`} />
            <span className="text-slate-300">
              {isConnected ? 'LIVE WS FEED' : 'DEMO MODE (LIVE SIM)'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <Zap className="text-amber-400 w-3.5 h-3.5" />
            <span className="text-slate-300">{logThroughput} logs/sec</span>
          </div>

          <select 
            value={currentUser} 
            onChange={(e) => setCurrentUser(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="Anish (Lead SRE)">User: Anish (Lead SRE)</option>
            <option value="Sarah (Database Admin)">User: Sarah (DBA)</option>
            <option value="DevOps Bot">User: DevOps Bot</option>
          </select>

          <button 
            onClick={exportPostMortem}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 transition px-3 py-1.5 rounded-lg text-white font-sans font-medium shadow-lg shadow-rose-900/30"
          >
            <Download size={14} /> Export Report
          </button>
        </div>
      </header>

      {/* Main War-Room Grid */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        
        {/* Left Col: High-Volume Stream Terminal (7 cols) */}
        <section className="col-span-7 flex flex-col border-r border-slate-800 bg-black/40">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/40 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Terminal size={14} className="text-cyan-400" />
              <span>SYNCHRONIZED TELEMETRY STREAM</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-500">{isConnected ? 'WS Broadcast (50ms buffer)' : 'Client-Side Simulation Stream'}</span>
            </div>

            <div className="flex items-center gap-2">
              <Filter size={12} className="text-slate-500" />
              {["ALL", "FATAL", "ERROR", "WARN"].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setFilterLevel(lvl)}
                  className={`px-2 py-0.5 rounded text-[11px] transition ${
                    filterLevel === lvl 
                      ? 'bg-slate-700 text-white font-bold' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Output */}
          <div 
            ref={logTerminalRef} 
            className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-slate-600 text-center mt-20">Initializing telemetry stream...</div>
            ) : (
              filteredLogs.map(l => (
                <div key={l.seq_id} className="flex items-start gap-2 hover:bg-slate-900/50 py-0.5 px-1 rounded transition">
                  <span className="text-slate-600">#{l.seq_id}</span>
                  <span className="text-slate-500">[{l.timestamp.slice(11, 19)}]</span>
                  <span className="text-cyan-400">[{l.service}]</span>
                  <span className={`font-bold ${
                    l.level === 'FATAL' ? 'text-rose-500 bg-rose-950/40 px-1 rounded' :
                    l.level === 'ERROR' ? 'text-red-400' :
                    l.level === 'WARN' ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    {l.level}
                  </span>
                  <span className="text-slate-300 break-all">{l.message}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right Col: Runbook Checklist & Live Timeline (5 cols) */}
        <section className="col-span-5 flex flex-col bg-slate-950/70">
          
          {/* Active Runbook Checklist */}
          <div className="h-1/2 flex flex-col border-b border-slate-800">
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                CONCURRENT INCIDENT RUNBOOK
              </span>
              <span className="text-slate-500 text-[10px]">Optimistic Step Locks</span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2">
              {incident?.runbook.map(step => (
                <div 
                  key={step.id} 
                  className={`p-3 rounded-lg border text-xs transition flex items-center justify-between ${
                    step.status === 'COMPLETED' 
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-400' 
                      : step.status === 'IN_PROGRESS'
                      ? 'bg-amber-950/20 border-amber-700/50 text-slate-200'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex-1 pr-3">
                    <div className="font-semibold text-slate-100 flex items-center gap-2">
                      <span>{step.id}. {step.title}</span>
                      {step.lockedBy && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Lock size={10} /> {step.lockedBy}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {step.status === 'PENDING' && (
                      <button
                        onClick={() => claimStep(step.id)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded text-[11px] font-sans font-medium transition cursor-pointer"
                      >
                        Claim Step
                      </button>
                    )}

                    {step.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => completeStep(step.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded text-[11px] font-sans font-medium transition flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 size={12} /> Mark Done
                      </button>
                    )}

                    {step.status === 'COMPLETED' && (
                      <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                        Resolved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline & War-Room Communications */}
          <div className="h-1/2 flex flex-col bg-slate-900/20">
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between text-xs">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Users size={14} className="text-indigo-400" />
                IMMUTABLE TIMELINE & WAR-ROOM CHAT
              </span>
              <span className="text-slate-500 text-[10px]">Event Sourced</span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
              {incident?.timeline.map(t => (
                <div key={t.id} className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span className="font-bold text-indigo-400">{t.user}</span>
                    <span>{new Date(t.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-300 font-sans">{t.message}</p>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={sendChatMessage} className="p-2 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Broadcast update to war-room..."
                className="flex-1 bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <button 
                type="submit" 
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs transition cursor-pointer"
              >
                <Send size={14} />
              </button>
            </form>
          </div>

        </section>
      </div>
    </div>
  );
}