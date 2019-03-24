package main

import (
    "fmt"
    "log"
    "net/http"
    "encoding/json"
)

type Article struct {
    Title string `json:"Title"`
    Desc string `json:"desc"`
    Content string `json:"content"`
}

type Articles []Article

func allArticles(w http.ResponseWriter, r *http.Request) {
    articles := Articles{
        Article{Title:"Test title", Desc: "Test desc", Content: "Test content"},
    }


    fmt.Println("Endpoint hit: All Articles endpoint")
    json.NewEncoder(w).Encode(articles)
}

func homePage(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Homepage Endpoint hit")
}

func handleRequests() {
    http.HandleFunc("/", homePage)
    http.HandleFunc("/articles", allArticles)
    log.Fatal(http.ListenAndServe(":8081", nil))
}

func main() {
    
    handleRequests()
    fmt.Printf("hello, world\n")
}
