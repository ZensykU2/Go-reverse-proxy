package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "backend answer from %s: %s\n", r.Host, r.URL.Path)
	})

	// Server 1 (Port 8081)
	go func() {
		fmt.Println("backend running on :8081")
		if err := http.ListenAndServe(":8081", nil); err != nil {
			fmt.Println("Error on port 8081:", err)
		}
	}()

	// Server 2 (Port 8082)
	go func() {
		fmt.Println("Backend running on :8082")
		if err := http.ListenAndServe(":8082", nil); err != nil {
			fmt.Println("Error on port 8082:", err)
		}
	}()

	// Blocking so the program doesn't end.
	select {}
}
