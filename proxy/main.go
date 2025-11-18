package main

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"sync/atomic"
)

// List of backends
var backends = []*url.URL{
	mustParse("http://localhost:8081"),
	mustParse("http://localhost:8082"),
}

// counter for round-robin-choice
var counter uint64

func main() {
	http.HandleFunc("/", handleRequest)

	log.Println("Reverse proxy with load balancing runs on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

func handleRequest(w http.ResponseWriter, r *http.Request) {
	// Choose backend
	index := int(atomic.AddUint64(&counter, 1)) % len(backends)
	target := backends[index]

	// Request for chosen backend rewrite
	r.URL.Scheme = target.Scheme
	r.URL.Host = target.Host
	r.Host = target.Host

	resp, err := http.DefaultTransport.RoundTrip(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// transfer headers
	for name, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(name, value)
		}
	}

	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)

	log.Printf("→ Request to %s sent (%s %s)\n", target.Host, r.Method, r.URL.Path)
}

func mustParse(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		log.Fatal(err)
	}
	return u
}
