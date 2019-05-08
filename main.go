package main

import (
    "fmt"
    "log"
    "net/http"
    "encoding/json"
    "os"
    "database/sql"
    _ "github.com/lib/pq"
)


type TourismOffer struct {
    FlyingCompany string `json:flyingCompany`
    DepartureCity string `json:departureCity`
    DestinationCity string `json:destinationCity`
    Hotel string `json:hotel`
    Price string `json:price`
    HotelImage string `json:hotelImage`
}

type Users struct {
    db *sql.DB
}

type TourismOffers []TourismOffer

type HttpResponse struct {
    ResponseCode int `json:responseCode`
    ResponseMessage string `json:responseMessage`
}

const (
    host     = "localhost"
    dbPort     = 5432
    user     = "postgres"
    password = "password"
    dbname   = "amir_database"
)

func allTourismOffers(w http.ResponseWriter, r *http.Request) {
    offers := TourismOffers{
        TourismOffer{FlyingCompany:"Air Algérie", DepartureCity: "Alger", DestinationCity: "Rome", Hotel:"Sheraton", Price:"350€"},
    }


    fmt.Println("Endpoint hit: All tourism offers endpoint")
    json.NewEncoder(w).Encode(offers)
}

func (users *Users)  addOffer(w http.ResponseWriter, req *http.Request) {
    fmt.Println("Endpoint hit: addOffer")

    
    dbConnect := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS '%s';",dbname)
    fmt.Println("addOffer connect: ", dbConnect)

    if _, err := users.db.Exec(dbConnect); err != nil {
        errMessage := fmt.Sprintf("Error creating database: %q", err)
        fmt.Println(errMessage)
        httpResponse := HttpResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: errMessage}
        json.NewEncoder(w).Encode(httpResponse)
        return
    }

    createTableCmd := fmt.Sprintf("CREATE TABLE IF NOT EXISTS TOURISM_OFFERS (flyingCompany CHAR(10), departureCity CHAR(10), destinationCity CHAR(10), hotel CHAR(10), price CHAR(10), hotelImage CHAR(10));")
    fmt.Println("addOffer connect: ", createTableCmd)

    if _, err := users.db.Exec(createTableCmd); err != nil {
            errMessage := fmt.Sprintf("Error creating database table: %q", err)
            fmt.Println(errMessage)
            httpResponse := HttpResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: errMessage}
            json.NewEncoder(w).Encode(httpResponse)
        return
    }

    decoder := json.NewDecoder(req.Body)
    var tourismOffer TourismOffer
    err := decoder.Decode(&tourismOffer)
    if err != nil {
        panic(err)
    }

    fmt.Println("deconding body offer: ", tourismOffer)

    insertOfferCmd := fmt.Sprintf("INSERT INTO TOURISM_OFFERS (flyingCompany, departureCity, destinationCity, hotel, price, hotelImage) VALUES ('%s','%s','%s','%s','%s','%s');", tourismOffer.FlyingCompany, tourismOffer.DepartureCity, tourismOffer.DestinationCity, tourismOffer.Hotel, tourismOffer.Price, tourismOffer.HotelImage)

    fmt.Println("insert command: ", insertOfferCmd)
    if _, err := users.db.Query(insertOfferCmd); err != nil {
            fmt.Printf("Error inserting offer: %q", err)
            //http.Error(w, err.Error(), http.StatusInternalServerError)
            httpResponse := HttpResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
            json.NewEncoder(w).Encode(httpResponse)
            return
    }

    httpResponse := HttpResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success"}

    fmt.Println("Inserted offer: ", tourismOffer.Hotel)
    json.NewEncoder(w).Encode(httpResponse)
}

func homePage(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Homepage Endpoint hit")
}

func handleRequests() {

    port := os.Getenv("PORT")

    if port == ""{
        port = "8000"
    }
/*
    psqlInfo := fmt.Sprintf("host=%s port=%d user=%s "+"password=%s sslmode=disable",host, dbPort, user, password)

    db, err := sql.Open("postgres", psqlInfo)
    if err != nil {
        panic(err)
    }

    defer db.Close()

    err = db.Ping()
    if err != nil {
        panic(err)
    }

    fmt.Println("Successfully connected!")
    */
    db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
    if err != nil {
        log.Fatalf("Error opening database: %q", err)
    }

    users := &Users{db: db}

    http.HandleFunc("/", homePage)
    http.HandleFunc("/tourismOffers", allTourismOffers)
    http.HandleFunc("/addOffer", users.addOffer)

    log.Fatal(http.ListenAndServe(":"+port, nil))
}

func main() {
    fmt.Printf("hello, world\n")
    handleRequests()
    
}
