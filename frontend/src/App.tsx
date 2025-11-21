import { useEffect, useState, useRef } from "react";
import "./App.css";

interface Backend {
  name: string;
  host: string;
  healthy: boolean;
  lastSeen: string;
  activeRequests?: number;
}

export default function App() {

  const [backends, setBackends] = useState<Backend[]>([]);
  const [proxyState, setProxyState] = useState("active");
  const [strategy, setStrategy] = useState("round_robin");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    const res = await fetch("/api/status");
    const data = await res.json();
    setBackends(data);
  };

  const fetchProxyState = async () => {
    try {
      const res = await fetch("/api/proxy/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Server returned error");
      const data = await res.json();
      setProxyState(data.state);
    } catch {
      setProxyState("offline");
    }
  };

  const fetchStrategy = async () => {
    try {
      const res = await fetch("/api/proxy/strategy");
      const data = await res.json();
      setStrategy(data.strategy);
    } catch (err) {
      console.error("Failed to fetch strategy", err);
    }
  };

  const changeStrategy = async (newStrategy: string) => {
    try {
      await fetch("/api/proxy/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: newStrategy }),
      });
      setStrategy(newStrategy);
    } catch (err) {
      console.error("Failed to set strategy", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchProxyState();
    fetchStrategy();
    const id1 = setInterval(fetchStatus, 1000);
    const id2 = setInterval(fetchProxyState, 1000);
    const id3 = setInterval(fetchStrategy, 1000);

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      clearInterval(id1);
      clearInterval(id2);
      clearInterval(id3);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleProxy = async (active: boolean) => {
    await fetch(`/api/proxy/${active ? "resume" : "pause"}`, { method: "POST" });
    setTimeout(fetchProxyState, 600);
  };

  const stopBackend = async (name: string) => {
    await fetch(`/api/stop?name=${name}`, { method: "POST" });
    setTimeout(fetchStatus, 800);
  };

  const startBackend = async (name: string) => {
    await fetch(`/api/start?name=${name}`, { method: "POST" });
    setTimeout(fetchStatus, 1200);
  };

  const [testResult, setTestResult] = useState<{
    status: number;
    body: string;
    time: number;
  } | null>(null);

  const sendTestRequest = async () => {
    const start = performance.now();
    try {
      const res = await fetch("/proxy/test");
      const text = await res.text();
      setTestResult({
        status: res.status,
        body: text,
        time: Math.round(performance.now() - start),
      });
    } catch (err) {
      setTestResult({
        status: 404,
        body: "Connection failed — proxy not reachable.",
        time: Math.round(performance.now() - start),
      });
    }
  };

  return (

    <div className="dashboard">
      <header>
        <h1>Reverse Proxy Dashboard</h1>
        <div className="proxy-state">
          <span
            className={`state-dot ${proxyState === "active" ? "active" : "paused"}`}
          ></span>
          <span>{proxyState.toUpperCase()}</span>
        </div>
        <div className="proxy-buttons">
          {proxyState === "active" && (
            <button className="btn btn-stop" onClick={() => toggleProxy(false)}>
              Pause Proxy
            </button>
          )}
          {proxyState === "paused" && (
            <button className="btn btn-start" onClick={() => toggleProxy(true)}>
              Resume Proxy
            </button>
          )}
          {proxyState === "offline" && (
            <button className="btn btn-disabled" disabled>
              Proxy Offline
            </button>
          )}
        </div>
      </header>
      <main>
        <section className="strategy-selector">
          <div className="strategy-wrapper" ref={dropdownRef}>
            <div className="custom-select-container">
              <div
                className={`custom-select-trigger ${isDropdownOpen ? "open" : ""}`}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                {strategy === "round_robin" ? "Round Robin" : "Least Connections"}
                <span className="arrow"></span>
              </div>
              {isDropdownOpen && (
                <div className="custom-options">
                  <div
                    className={`custom-option ${strategy === "round_robin" ? "selected" : ""}`}
                    onClick={() => {
                      changeStrategy("round_robin");
                      setIsDropdownOpen(false);
                    }}
                  >
                    Round Robin
                  </div>
                  <div
                    className={`custom-option ${strategy === "least_connections" ? "selected" : ""}`}
                    onClick={() => {
                      changeStrategy("least_connections");
                      setIsDropdownOpen(false);
                    }}
                  >
                    Least Connections
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <table className="backend-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Status</th>
              <th>Active Requests</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {backends.map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td>{b.host}</td>
                <td>
                  <span
                    className={`badge ${b.healthy ? "online" : "offline"}`}
                  >
                    {b.healthy ? "Online" : "Offline"}
                  </span>
                </td>
                <td>{b.activeRequests !== undefined ? b.activeRequests : "—"}</td>
                <td>
                  {b.lastSeen
                    ? new Date(b.lastSeen).toLocaleString()
                    : "—"}
                </td>
                <td>
                  <button
                    className={`btn ${b.healthy ? "btn-stop" : "btn-start"}`}
                    onClick={() =>
                      b.healthy ? stopBackend(b.name) : startBackend(b.name)
                    }
                  >
                    {b.healthy ? "Stop" : "Start"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="tests-section">
          <div className="test-card">
            <h3>Proxy Connectivity</h3>
            <p className="test-desc">
              Send a test request to <code>/proxy/test</code> to verify the proxy is reachable and forwarding correctly.
            </p>
            <button
              className={`btn btn-accent ${proxyState === "offline" ? "btn-disabled" : ""}`}
              onClick={sendTestRequest}
              disabled={proxyState === "offline"}
            >
              Test Connectivity
            </button>

            {testResult && (
              <div
                className={`tester-result ${testResult.status >= 500
                  ? "error"
                  : testResult.status >= 400
                    ? "warning"
                    : "success"
                  }`}
              >
                <p>
                  <strong>
                    Status {testResult.status > 0 ? testResult.status : "?"}
                  </strong>{" "}
                  {testResult.time && (
                    <span className="response-time">{testResult.time} ms</span>
                  )}
                </p>
                <pre>
                  {(() => {
                    try {
                      const obj = JSON.parse(testResult.body);
                      return JSON.stringify(obj, null, 2);
                    } catch {
                      return testResult.body;
                    }
                  })()}
                </pre>
              </div>
            )}
          </div>

          <div className="test-card">
            <h3>Load Testing</h3>
            <p className="test-desc">
              Simulate traffic to visualize how the proxy distributes requests across backends.
            </p>
            <div className="load-buttons">
              <button
                className="btn btn-accent"
                onClick={() => fetch("/proxy/slow?duration=10s")}
              >
                Single Slow Request (10s)
              </button>
              <button
                className="btn btn-accent"
                onClick={() => {
                  for (let i = 0; i < 5; i++) {
                    fetch(`/proxy/slow?duration=10s&r=${Math.random()}`).catch(console.error);
                  }
                }}
              >
                Spam Slow Requests (5x)
              </button>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <a href="https://github.com/ZensykU2" target="_blank" rel="noreferrer"><img src="/favicon.png" alt="Zensyk Avatar" className="avatar" /></a>
        <p>
          Created by{" "}
          <a href="https://github.com/ZensykU2" target="_blank" rel="noreferrer">
            <span className="brand">Zensyk</span>
          </a>
        </p>
      </footer>
    </div>
  );
}