package main

import (
	"fmt"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Backend (%s): %s\n", port, r.URL.Path)
	})

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		fmt.Printf("Issue on Port %s: %v\n", port, err)
	}
}
