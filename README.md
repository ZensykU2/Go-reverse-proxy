# Reverse Proxy Dashboard

An interactive, modern dashboard for a custom **Go Reverse Proxy** built from scratch,
and ontop with **React + Vite**.

This tool gives you a full visual control over your proxy, including backend health, load balancing, and live testing.

---

## Features

### Reverse Proxy (Go)
- **Start, Stop, Pause, Resume** proxy with one click
- **Automatic backend management** via Go (`exec.Command`)
- **Round-Robin Load Balancing** between configured backends
- **Health checks** every 3 seconds (status updates in real time)
- **Config file (`config.json`)** for backend definitions
- Standalone executable or **Docker-Ready**

### Frontend (React + Vite)
- Sleek **dark UI** design
- **Real-time monitoring** with status indicators
- **Backend control** (Start/Stop) directly from the UI
- Built-in **Proxy Tester** to check request responses on `/proxy/test`
- Retry-safe - Detects when proxy is offline
- Responsive design with smooth transitions
- Subtle glow effects for status and panels

---

## Setup & Installation

### Requirements
- **Go 1.22+**
- **Node.js 20+ / npm 9+**

---

### Launch the Go proxy

```bash
cd proxy
go run .
```
this starts the proxy(`:8080`)
and starts the configured backends from `config.json`
Console output will show backend state and health check updates.

---

### Run the Frontend

```bash
cd frontend
npm install
npm run dev
```
Then open:
```bash
http://localhost:5173
```
The Vite dev server will automatically proxy `/api` and `/proxy` requests to Go (see `vite.config.ts`).

---

### Proxy Tester

At the bottom of the dashboard you'll find the Proxy Tester:
- Sends a test request to `/proxy/test`
- Displays:
    - HTTP stauts code
    - Response time (ms)
    - Response body

Useful for quickly verifying pause/resume behavior, no terminal needed.

---

### API Overview (Go Endpoints)

| Route                   | Method | Description                                      |
|--------------------------|--------|--------------------------------------------------|
| /api/status              | GET    | Returns the current health of all backends       |
| /api/start?name={backend} | POST   | Start or restart a specific backend              |
| /api/stop?name={backend}  | POST   | Stop a specific backend                          |
| /api/proxy/pause         | POST   | Disable proxy forwarding temporarily             |
| /api/proxy/resume        | POST   | Re‑enable the proxy                              |
| /api/proxy/state         | GET    | Returns current proxy state (active, paused, offline) |
| /proxy/{path}            | Any    | The actual request forwarding endpoint           |

