package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"log"
	"net/http"
	"os"
	sdu "sama-djazair/utils"
)

// TourismOffer represent a unit offer for tourism
type TourismOffer struct {
	FlyingCompany   string `json:"flyingCompany"`
	DepartureCity   string `json:"departureCity"`
	DestinationCity string `json:"destinationCity"`
	Hotel           string `json:"hotel"`
	Price           string `json:"price"`
	HotelImage      string `json:"hotelImage"`
	TravelAgency    string `json:"travelAgency"`
	TravelDuration  int    `json:"travelDuration"`
	HotelStars      int    `json:"hotelStars"`
	IsHotOffer      bool   `json:"isHotOffer"`
	AgencyAddress   string `json:"agencyAddress"`
	AgencyPhone     string `json:"agencyPhone"`
}

// Users represent connection to sql DB
type Users struct {
	db *sql.DB
}

// TourismOffers is list of tourism offers
type TourismOffers []TourismOffer

// HTTPResponse represents generic http response
type HTTPResponse struct {
	ResponseCode    int    `json:"responseCode"`
	ResponseMessage string `json:"responseMessage"`
}

// TourismOffersHTTPResponse represents data for tourism offers
type TourismOffersHTTPResponse struct {
	ResponseDetails HTTPResponse  `json:"httpResponse"`
	Data            TourismOffers `json:"tourismOffers"`
}

const (
	host     = "localhost"
	dbPort   = 5432
	user     = "postgres"
	password = "password"
	dbname   = "sama_database"
)

func allTourismOffers(w http.ResponseWriter, r *http.Request) {
	offers := TourismOffers{
		TourismOffer{FlyingCompany: "Air Algérie", DepartureCity: "Alger", DestinationCity: "Rome", Hotel: "Sheraton", Price: "350€"},
	}

	fmt.Println("Endpoint hit: All tourism offers endpoint")
	json.NewEncoder(w).Encode(offers)
}

func (users *Users) addOffer(w http.ResponseWriter, req *http.Request) {
	fmt.Println("Endpoint hit: addOffer")

	/*
	   dbConnect := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS '%s';",dbname)
	   fmt.Println("addOffer connect: ", dbConnect)

	   if _, err := users.db.Exec(dbConnect); err != nil {
	       errMessage := fmt.Sprintf("Error creating database: %q", err)
	       fmt.Println(errMessage)
	       hTTPResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: errMessage}
	       json.NewEncoder(w).Encode(hTTPResponse)
	       return
	   }
	*/
	createTableCmd := fmt.Sprintf("CREATE TABLE IF NOT EXISTS TOURISM_OFFERS (flyingCompany CHAR(10), departureCity CHAR(10), destinationCity CHAR(10), hotel CHAR(10), price CHAR(10), hotelImage CHAR(10));")
	fmt.Println("addOffer connect: ", createTableCmd)

	if _, err := users.db.Exec(createTableCmd); err != nil {
		errMessage := fmt.Sprintf("Error creating database table: %q", err)
		fmt.Println(errMessage)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: errMessage}
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
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	httpResponse := HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success"}

	fmt.Println("Inserted offer: ", tourismOffer.Hotel)
	json.NewEncoder(w).Encode(httpResponse)
	return
}

func (users *Users) getOfferByCompanyName(w http.ResponseWriter, req *http.Request) {

	companyName := sdu.URLParamAsString("companyName", req)
	fmt.Println("getOfferByCompanyName : ", companyName)

	getOfferByCompanyReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE flyingcompany LIKE '%s';", companyName)

	fmt.Println("select command: ", getOfferByCompanyReq)
	rows, err := users.db.Query(getOfferByCompanyReq)
	if err != nil {
		fmt.Printf("Error getting offer: %q", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results TourismOffers
	for rows.Next() {
		var tourismOffer TourismOffer
		if err := rows.Scan(&tourismOffer.FlyingCompany,
			&tourismOffer.DepartureCity,
			&tourismOffer.DestinationCity,
			&tourismOffer.Hotel,
			&tourismOffer.Price,
			&tourismOffer.HotelImage,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone); err != nil {
			fmt.Println("error getOfferByCompanyName error: ", err)
			httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
	fmt.Println("getOfferByCompanyName found offers: ", hdr)
	json.NewEncoder(w).Encode(hdr)
	return
}

func (users *Users) getAllTourismOffers(w http.ResponseWriter, req *http.Request) {
	fmt.Println("get All TourismOffers")

	getOfferByCompanyReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS;")

	fmt.Println("select command: ", getOfferByCompanyReq)
	rows, err := users.db.Query(getOfferByCompanyReq)
	if err != nil {
		fmt.Printf("Error getting all tourism offers: %q", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results TourismOffers
	for rows.Next() {
		var tourismOffer TourismOffer
		if err := rows.Scan(&tourismOffer.FlyingCompany,
			&tourismOffer.DepartureCity,
			&tourismOffer.DestinationCity,
			&tourismOffer.Hotel,
			&tourismOffer.Price,
			&tourismOffer.HotelImage,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone); err != nil {
			fmt.Println("error getAllTourismOffers error: ", err)
			httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
	//fmt.Println("getAllTourismOffers found offers: ", hdr)
	json.NewEncoder(w).Encode(hdr)
	return
}

func (users *Users) getOfferByCity(w http.ResponseWriter, req *http.Request) {
	fmt.Println("get All getOfferByCity")

	departureCity := sdu.URLParamAsString("departureCity", req)
	destinationCity := sdu.URLParamAsString("destinationCity", req)
	fmt.Println("getOfferByCity: ", departureCity)

	getOfferByCityReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE departureCity LIKE '%s' AND destinationCity LIKE '%s';", departureCity, destinationCity)

	fmt.Println("select command: ", getOfferByCityReq)
	rows, err := users.db.Query(getOfferByCityReq)
	if err != nil {
		fmt.Printf("Error getting offer: %q", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results TourismOffers
	for rows.Next() {
		var tourismOffer TourismOffer
		if err := rows.Scan(&tourismOffer.FlyingCompany,
			&tourismOffer.DepartureCity,
			&tourismOffer.DestinationCity,
			&tourismOffer.Hotel,
			&tourismOffer.Price,
			&tourismOffer.HotelImage,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone); err != nil {
			fmt.Println("error getOfferByCity error: ", err)
			httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
	json.NewEncoder(w).Encode(hdr)

	return
}

func (users *Users) getHotTourismOffers(w http.ResponseWriter, req *http.Request) {
	fmt.Println("get All getHotTourismOffers")

	getHotOffers := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE ishotoffer is true;")

	fmt.Println("select command: ", getHotOffers)
	rows, err := users.db.Query(getHotOffers)
	if err != nil {
		fmt.Printf("Error getting offer: %q", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results TourismOffers
	for rows.Next() {
		var tourismOffer TourismOffer
		if err := rows.Scan(&tourismOffer.FlyingCompany,
			&tourismOffer.DepartureCity,
			&tourismOffer.DestinationCity,
			&tourismOffer.Hotel,
			&tourismOffer.Price,
			&tourismOffer.HotelImage,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone); err != nil {
			fmt.Println("error getHotOffers error: ", err)
			httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
	json.NewEncoder(w).Encode(hdr)

	fmt.Println("select command: ", w)

	return
}

func homePage(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Homepage Endpoint hit")
}

func handleRequests() {

	port := os.Getenv("PORT")

	if port == "" {
		port = "8000"
	}
	/*
		psqlInfo := fmt.Sprintf("host=%s port=%d user=%s "+"password=%s sslmode=disable", host, dbPort, user, password)

		db, err := sql.Open("postgres", psqlInfo)
		if err != nil {
			panic(err)
		}

		defer db.Close()

		err = db.Ping()
		if err != nil {
			panic(err)
		}

		fmt.Println("Successfully !")
	*/

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Error opening database: %q", err)
	} else {
		fmt.Println("Successfully connected to DB!")
	}

	users := &Users{db: db}

	r := mux.NewRouter()
	r.HandleFunc("/tourismOffers", allTourismOffers)
	r.HandleFunc("/addOffer", users.addOffer)
	r.HandleFunc("/getOffers/getOfferByName/{companyName}", users.getOfferByCompanyName).Methods("GET")
	r.HandleFunc("/getOffers/getOfferByCity/{departureCity}/{destinationCity}", users.getOfferByCity).Methods("GET")
	r.HandleFunc("/getOffers/allTourismOffers", users.getAllTourismOffers).Methods("GET")
	r.HandleFunc("/getHotTourismOffers", users.getHotTourismOffers).Methods("GET")

	//log.Fatal(http.ListenAndServeTLS(":8000", "./certifs/public.cert", "./certifs/private.key", r))
	log.Fatal(http.ListenAndServe(":"+port, r))

}

func main() {
	fmt.Printf("hello, world\n")
	handleRequests()

}
