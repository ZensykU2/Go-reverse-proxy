package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// ------------------------------------------------------------
// types
// ------------------------------------------------------------

type Config struct {
	Name string `json:"name"`
	Port int    `json:"port"`
}

type Backend struct {
	Name     string
	URL      *url.URL
	Healthy  bool
	LastSeen time.Time
	Cmd      *exec.Cmd
}

type BackendStatus struct {
	Name     string    `json:"name"`
	Host     string    `json:"host"`
	Healthy  bool      `json:"healthy"`
	LastSeen time.Time `json:"lastSeen"`
}

// ------------------------------------------------------------
// globals
// ------------------------------------------------------------

var (
	backends    []*Backend
	counter     uint64
	mu          sync.RWMutex
	proxyActive atomic.Bool
)

// ------------------------------------------------------------
// main
// ------------------------------------------------------------

func main() {
	// load config.json
	cfgs, err := loadConfig("config.json")
	if err != nil {
		log.Fatalf("Issue reading config.json: %v", err)
	}

	// start backends
	for _, cfg := range cfgs {
		b := newBackend(cfg)
		backends = append(backends, b)
		startBackend(b)
	}

	// start health checks
	go healthMonitor()

	// Signal-Handling for clean exit
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		cleanup()
		os.Exit(0)
	}()

	proxyActive.Store(true) // default enabled

	// send api status to frontend
	http.HandleFunc("/api/status", handleAPIStatus)
	// manually stop backend serve
	http.HandleFunc("/api/stop", handleStopBackend)
	http.HandleFunc("/api/start", handleStartOrRestartBackend)
	// start proxy
	http.HandleFunc("/proxy/", handleRequest)
	http.HandleFunc("/api/proxy/pause", handleProxyPause)
	http.HandleFunc("/api/proxy/resume", handleProxyResume)
	http.HandleFunc("/api/proxy/state", handleProxyState)
	log.Println("reverse proxy running on port :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

// ------------------------------------------------------------
// request handling
// ------------------------------------------------------------

func handleAPIStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	mu.RLock()
	defer mu.RUnlock()

	statusList := make([]BackendStatus, 0, len(backends))
	for _, b := range backends {
		statusList = append(statusList, BackendStatus{
			Name:     b.Name,
			Host:     b.URL.Host,
			Healthy:  b.Healthy,
			LastSeen: b.LastSeen,
		})
	}

	json.NewEncoder(w).Encode(statusList)
}

func handleRequest(w http.ResponseWriter, r *http.Request) {
	if !proxyActive.Load() {
		http.Error(w, "Proxy is currently paused", http.StatusServiceUnavailable)
		return
	}

	b := getNextHealthyBackend()
	if b == nil {
		http.Error(w, "No healthy backend available", http.StatusServiceUnavailable)
		return
	}

	r.URL.Scheme = b.URL.Scheme
	r.URL.Host = b.URL.Host
	r.Host = b.URL.Host

	resp, err := http.DefaultTransport.RoundTrip(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, v := range resp.Header {
		for _, vv := range v {
			w.Header().Add(k, vv)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)

	log.Printf("Request to backend '%s' (%s) forwarded", b.Name, b.URL.Host)
}

func handleProxyPause(w http.ResponseWriter, r *http.Request) {
	proxyActive.Store(false)
	log.Println("Reverse Proxy disabled")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "paused",
		"message": "Proxy disabled",
	})
}

func handleProxyResume(w http.ResponseWriter, r *http.Request) {
	proxyActive.Store(true)
	log.Println("Reverse Proxy enabled")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "active",
		"message": "Proxy enabled",
	})
}

func handleProxyState(w http.ResponseWriter, r *http.Request) {
	state := "paused"
	if proxyActive.Load() {
		state = "active"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"state": state,
	})
}

func handleStartOrRestartBackend(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Parameter 'name' missing", http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()

	for _, b := range backends {
		if b.Name == name {
			// If process running, restart
			if b.Cmd != nil && b.Cmd.Process != nil {
				log.Printf("Backend '%s' restarting ...", b.Name)
				b.Cmd.Process.Kill()
			} else {
				log.Printf("Backend '%s' starting ...", b.Name)
			}

			startBackend(b)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"message": fmt.Sprintf("Backend '%s' gestartet/neu gestartet", b.Name),
			})
			return
		}
	}

	http.Error(w, fmt.Sprintf("Backend '%s' nicht gefunden", name), http.StatusNotFound)
}

func handleStopBackend(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Parameter 'name' fehlt", http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()

	for _, b := range backends {
		if b.Name == name {
			if b.Cmd != nil && b.Cmd.Process != nil {
				err := b.Cmd.Process.Kill()
				if err != nil {
					http.Error(w, fmt.Sprintf("Fehler beim Stoppen von %s: %v", name, err), http.StatusInternalServerError)
					return
				}
				b.Healthy = false
				log.Printf("✋ Backend '%s' wurde manuell gestoppt", b.Name)
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{
					"message": fmt.Sprintf("Backend '%s' gestoppt", b.Name),
				})
				return
			}
		}
	}

	http.Error(w, fmt.Sprintf("Backend '%s' nicht gefunden oder bereits gestoppt", name), http.StatusNotFound)
}

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

func loadConfig(path string) ([]Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var cfg []Config
	err = json.NewDecoder(file).Decode(&cfg)
	return cfg, err
}

func newBackend(cfg Config) *Backend {
	u, err := url.Parse(fmt.Sprintf("http://localhost:%d", cfg.Port))
	if err != nil {
		log.Fatal(err)
	}
	return &Backend{Name: cfg.Name, URL: u}
}

func startBackend(b *Backend) {
	port := b.URL.Port()

	// check if binary exists, else build
	if _, err := os.Stat("../backend/backend.exe"); os.IsNotExist(err) {
		log.Println("Building backend binary")
		buildCmd := exec.Command("go", "build", "-o", "backend.exe", "backend.go")
		buildCmd.Dir = "../backend"
		buildCmd.Stdout = log.Writer()
		buildCmd.Stderr = log.Writer()
		if err := buildCmd.Run(); err != nil {
			log.Fatalf("backend build error: %v", err)
		}
	}

	// start executable
	cmd := exec.Command("../backend/backend.exe")
	cmd.Env = append(cmd.Env, fmt.Sprintf("PORT=%s", port))
	cmd.Stdout = log.Writer()
	cmd.Stderr = log.Writer()

	if err := cmd.Start(); err != nil {
		log.Printf("Backend '%s' (%s) couldn't start: %v", b.Name, port, err)
		return
	}
	b.Cmd = cmd
	log.Printf("Backend '%s' automatically started (Port %s)", b.Name, port)
}

func getNextHealthyBackend() *Backend {
	mu.RLock()
	defer mu.RUnlock()

	var healthy []*Backend
	for _, b := range backends {
		if b.Healthy {
			healthy = append(healthy, b)
		}
	}
	if len(healthy) == 0 {
		return nil
	}
	index := int(atomic.AddUint64(&counter, 1)) % len(healthy)
	return healthy[index]
}

// ------------------------------------------------------------
// monitoring + cleanup
// ------------------------------------------------------------

func healthMonitor() {
	for {
		for _, b := range backends {
			addr := b.URL.Host
			conn, err := net.DialTimeout("tcp", addr, 800*time.Millisecond)
			mu.Lock()
			if err != nil {
				if b.Healthy {
					log.Printf("%s (%s) is not available", b.Name, addr)
				}
				b.Healthy = false
			} else {
				conn.Close()
				if !b.Healthy {
					log.Printf("%s (%s) is available again", b.Name, addr)
				}
				b.Healthy = true
				b.LastSeen = time.Now()
			}
			mu.Unlock()
		}
		time.Sleep(3 * time.Second)
	}
}

func cleanup() {
	log.Println("proxy shut-down, disabling backends ...")
	for _, b := range backends {
		if b.Cmd != nil && b.Cmd.Process != nil {
			b.Cmd.Process.Kill()
			log.Printf("Backend '%s' stopped", b.Name)
		}
	}
	log.Println("All backends shut-down.")
}
