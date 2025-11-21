package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Backend (%s): %s\n", port, r.URL.Path)
	})

	http.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		durationStr := r.URL.Query().Get("duration")
		duration, err := time.ParseDuration(durationStr)
		if err != nil {
			duration = 2 * time.Second
		}
		time.Sleep(duration)
		fmt.Fprintf(w, "Backend (%s): Slow request finished after %v\n", port, duration)
	})

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Printf("Issue on Port %s: %v\n", port, err)
	}
}
