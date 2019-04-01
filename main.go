package main

import (
    "fmt"
    "log"
    "net/http"
    "encoding/json"
    "os"
)


type TourismOffer struct {
    FlyingCompany string `json:FlyingCompany`
    DepartureCity string `json:departureCity`
    DestinationCity string `json:destinationCity`
    Hotel string `json:hotel`
    Price string `json:price`
}

type TourismOffers []TourismOffer

func allTourismOffers(w http.ResponseWriter, r *http.Request) {
    offers := TourismOffers{
        TourismOffer{FlyingCompany:"Air Algérie", DepartureCity: "Alger", DestinationCity: "Rome", Hotel:"Sheraton", Price:"350€"},
    }


    fmt.Println("Endpoint hit: All tourism offers endpoint")
    json.NewEncoder(w).Encode(offers)
}

func homePage(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Homepage Endpoint hit")
}

func handleRequests() {
    http.HandleFunc("/", homePage)
    http.HandleFunc("/tourismOffers", allTourismOffers)

    port := os.Getenv("PORT")

    if port == ""{
        port = "8000"
    }
    log.Fatal(http.ListenAndServe(":"+port, nil))
}

func main() {
    fmt.Printf("hello, world\n")
    handleRequests()
    
}
