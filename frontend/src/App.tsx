import { useEffect, useState } from "react";
import "./App.css";

interface Backend {
  name: string;
  host: string;
  healthy: boolean;
  lastSeen: string;
}

export default function App() {
  
  const [backends, setBackends] = useState<Backend[]>([]);
  const [proxyState, setProxyState] = useState("active");

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

  useEffect(() => {
    fetchStatus();
    fetchProxyState();
    const id1 = setInterval(fetchStatus, 3000);
    const id2 = setInterval(fetchProxyState, 3000);
    return () => {
      clearInterval(id1);
      clearInterval(id2);
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
        <table className="backend-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Status</th>
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

        <section className="proxy-tester">
          <h2>Proxy Tester</h2>
          <p className="tester-description">
            Sends test request to <code>/proxy/test</code> checking if
            Reverse‑Proxy is active.
          </p>

          <button className="btn btn-accent" onClick={sendTestRequest}>
            Test Proxy Connection
          </button>

          {testResult && (
            <div
              className={`tester-result ${
                testResult.status >= 500
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