package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	jwt "github.com/dgrijalva/jwt-go"
	guuid "github.com/google/uuid"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	bcrypt "golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"os"
	"time"
)

// Users represent connection to sql DB
type Users struct {
	db *sql.DB
}

var mySigningString = []byte("mysupersecretphrase")

// GenerateJWT generates a jwt token
func GenerateJWT() (string, error)  {

	token := jwt.New(jwt.SigningMethodHS256)

	claims := token.Claims.(jwt.MapClaims)

	claims["authorized"] = true
	claims["user"] = "Amir Attar"
	claims["exp"] = time.Now().Add(time.Minute*30).Unix()

	tokenString, err := token.SigningString()

	if err != nil {
		fmt.Errorf("Something went wrong: %s", err.Error())
		return "", err
	}

	return tokenString, nil
}

const typedHello string = "Hello, 世界"
// URLParamAsString returns an URL parameter /{name} as a string
func URLParamAsString(name string, r *http.Request) *string {
	vars := mux.Vars(r)
	value := vars[name]
	return &value
}

func GenerateSQLRequest(tableName string, parameters []string, r *http.Request) string {
	// retrieve parameters
	// map for parameters/values
	paramsMap := make(map[string]string)

	for _, paramName := range parameters {
		paramValue := r.URL.Query()[paramName]
		if paramValue != nil {
			paramsMap[paramName] = paramValue[0]
		}
	}
	fmt.Println(paramsMap)
	request :=  "SELECT * FROM " + tableName
	index := 0

	if len(paramsMap) > 0 {
		request = request +  " WHERE "
		// loop over map
		for key, value := range paramsMap {
			request = request + key + " = " + "'" + value + "'"
			if(index < len(paramsMap) - 1) {
				request += " AND "
			}
			index++
		}

	} else {
		request = request +  ";"
	}

	fmt.Println(request)
	return request
}

// TourismOffer represent a unit offer for tourism
type TourismOffer struct {
	OfferTitle       string `json:"offerTitle"`
	FlyingCompany    string `json:"flyingCompany"`
	DepartureCity    string `json:"departureCity"`
	DestinationCity  string `json:"destinationCity"`
	DepartureDate    string `json:"departureDate"`
	ReturnDate       string `json:"returnDate"`
	HotelName        string `json:"hotelName"`
	OfferPrice       string `json:"offerPrice"`
	OfferDescription string `json:"offerDescription"`
	TravelAgency     string `json:"travelAgency"`
	AgencyEmail      string `json:"agencyEmail"`
	TravelDuration   int    `json:"travelDuration"`
	HotelStars       int    `json:"hotelStars"`
	IsHotOffer       bool   `json:"isHotOffer"`
	AgencyAddress    string `json:"agencyAddress"`
	AgencyPhone      string `json:"agencyPhone"`
	OfferReference   string `json:"offerReference"`
	AgencyLogo       string `json:"agencyLogo,omitempty"`
	HotelId   		 string `json:"hotelId"`
	HotelPhotos   	[]string `json:"hotelPhotos"`
}

// OmraOffer represent a unit offer for tourism
type OmraOffer struct {
	OfferTitle        string `json:"offerTitle"`
	FlyingCompany     string `json:"flyingCompany"`
	DepartureCity     string `json:"departureCity"`
	DestinationCity   string `json:"destinationCity"`
	DistanceFromHaram string `json:"distanceFromHaram"`
	DepartureDate     string `json:"departureDate"`
	ReturnDate        string `json:"returnDate"`
	HotelName         string `json:"hotelName"`
	OfferPrice        string `json:"offerPrice"`
	OfferDescription  string `json:"offerDescription"`
	TravelAgency      string `json:"travelAgency"`
	AgencyEmail       string `json:"AgencyEmail"`
	TravelDuration    int    `json:"travelDuration"`
	HotelStars        int    `json:"hotelStars"`
	IsHotOffer        bool   `json:"isHotOffer"`
	AgencyAddress     string `json:"agencyAddress"`
	AgencyPhone       string `json:"agencyPhone"`
	AgencyLogo        string `json:"agencyLogo"`
}

// Hotel represent a Hotel
type Hotel struct {
	Id        string `json:"id"`
	Name     string `json:"name"`
	City     string `json:"city"`
	Stars   int `json:"stars"`
	Agency     string `json:"agency"`
}

// HotelPhoto represent a Hotel
type HotelPhoto struct {
	HotelId        string `json:"hotel_id"`
	Photo     string `json:"photo"`
}

// HotelPhotos represent a Hotel
type HotelPhotos struct {
	Id        string `json:"id"`
	Photos  []string `json:"Photos"`
}

// TourismOffers is list of tourism offers
type TourismOffers []TourismOffer

// TourismOffersHTTPResponse represents data for tourism offers
type TourismOffersHTTPResponse struct {
	ResponseDetails HTTPResponse  `json:"httpResponse"`
	Data            TourismOffers `json:"tourismOffers"`
}

// PreorderHTTPResponse represents data for tourism offers
type PreorderHTTPResponse struct {
	ResponseDetails HTTPResponse  `json:"httpResponse"`
	Data            PreorderData `json:"preorderData"`
}


type AuthenticationUser struct {
	UserName 	string `json:"userName"`
	Password 	string `json:"password"`
}

type User struct {
	Id       	string `json:"id"`
	UserName 	string `json:"userName"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Password 	string `json:"-"`
	Role    	string `json:"role"`
	Token    	string `json:"token"`
}

// HTTPResponse represents generic http response
type HTTPResponse struct {
	ResponseCode    int    `json:"responseCode"`
	ResponseMessage string `json:"responseMessage"`
	Id        		string `json:"id"`
}

type AuthenticationData struct {
	Username string `json:"username"`
	Token    string `json:"token"`
}

type AuthenticationHTTPResponse struct {
	User        User `json:"user"`
	ResponseDetails HTTPResponse       `json:"httpResponse"`
}


type Preorder struct {
	Id        		string `json:"id"`
	OfferReference    string `json:"offerReference"`
	UserFirstName    string `json:"userFirstName"`
	UserLastName     string `json:"userLastName"`
	UserEmail         string `json:"userEmail"`
	UserPhone         string `json:"userPhone"`
	NumberRooms       int    `json:"numberRooms"`
	NumberAdults      int    `json:"numberAdults"`
	NumberChildren    int    `json:"numberChildren"`
	NumberBabies      int    `json:"numberBabies"`
	ComplementaryInfo string `json:"complementaryInfo"`
}

type PreorderData struct {
	Offer TourismOffer `json:"offer"`
	Preorder Preorder `json:"preorder"`
}

const (
	host     = "localhost"
	dbPort   = 5432
	user     = "postgres"
	password = "password"
	dbname   = "sama_database"
)

func (users *Users) tourismOffers(w http.ResponseWriter, req *http.Request) {

    paramArray := []string{"departureCity", "destinationCity", "offerReference", "isHotOffer"}

	getOfferByCityReq := GenerateSQLRequest("TOURISM_OFFERS", paramArray, req)
	fmt.Println("********** get All tourismOffers: ", getOfferByCityReq)

    rows, err := users.db.Query(getOfferByCityReq)
    if err != nil {
        fmt.Println("Error getting offer: 1 ", err)
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
            &tourismOffer.HotelName,
            &tourismOffer.OfferPrice,
            &tourismOffer.TravelAgency,
            &tourismOffer.TravelDuration,
            &tourismOffer.HotelStars,
            &tourismOffer.IsHotOffer,
            &tourismOffer.AgencyAddress,
            &tourismOffer.AgencyPhone,
            &tourismOffer.OfferTitle,
            &tourismOffer.DepartureDate,
            &tourismOffer.ReturnDate,
            &tourismOffer.OfferDescription,
            &tourismOffer.AgencyEmail,
            &tourismOffer.OfferReference,
            &tourismOffer.AgencyLogo,
            &tourismOffer.HotelId); err != nil {
            fmt.Println("error getOfferByCity error: 2 ", err)
            httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
            json.NewEncoder(w).Encode(httpResponse)
            return
        }
        results = append(results, tourismOffer)
      }

	for i, result := range results {

		getOfferPhotosReq := fmt.Sprintf("SELECT photo FROM HOTEL_PHOTOS WHERE hotel_id = '%s';", result.HotelId)
		photoResults := make([]string, 0)
		rows, _ := users.db.Query(getOfferPhotosReq)
		for rows.Next() {
			var photo string
			if err := rows.Scan(&photo); err != nil {
				log.Fatal(err)
			}
			photoResults = append(photoResults, photo)
		}

		results[i].HotelPhotos = append(results[i].HotelPhotos, photoResults...)
	}

    hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}

    fmt.Println("getOfferByCity 1: ", len(results))
    json.NewEncoder(w).Encode(hdr)

    return
}

func (users *Users) addHotelPhoto(w http.ResponseWriter, req *http.Request) {
	fmt.Println("Endpoint hit: addHotelPhoto")

	decoder := json.NewDecoder(req.Body)
	var hotelPhoto HotelPhoto
	err := decoder.Decode(&hotelPhoto)
	if err != nil {
		panic(err)
	}

	//TODO handle offer reference column
	insertHotelPhotoCmd := fmt.Sprintf("INSERT INTO HOTEL_PHOTOS "+
		"(hotel_id, photo) VALUES " + "('%s','%s');",
		hotelPhoto.HotelId, hotelPhoto.Photo)

	if _, err := users.db.Query(insertHotelPhotoCmd); err != nil {
		fmt.Println("Error inserting Hotel photo: %q", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	httpResponse := HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success"}

	fmt.Println("Inserted hotel photo: ", hotelPhoto.HotelId)
	json.NewEncoder(w).Encode(httpResponse)
	return
}


func (users *Users) generatePreorder(w http.ResponseWriter, req *http.Request) {
	fmt.Println("Endpoint hit: generatePreorder")

	decoder := json.NewDecoder(req.Body)
	var preorder Preorder
	err := decoder.Decode(&preorder)
	if err != nil {
		panic(err)
	}

	var preorderId = guuid.New();
	insertPreorderCmd := fmt.Sprintf("INSERT INTO PREORDER "+
		"(Id, offer_reference, user_first_name, user_last_name, user_email, user_phone, number_rooms, number_adults, number_children, number_babies, complementary_info) VALUES "+
		"('%s','%s','%s','%s','%s','%s','%d','%d','%d','%d','%s');",
		preorderId, preorder.OfferReference, preorder.UserFirstName, preorder.UserLastName, preorder.UserEmail, preorder.UserPhone, preorder.NumberRooms, preorder.NumberAdults, preorder.NumberChildren, preorder.NumberBabies, preorder.ComplementaryInfo)

	if _, err := users.db.Query(insertPreorderCmd); err != nil {
		fmt.Println("Error inserting Preorder: %q", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	httpResponse := HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success", Id: preorderId.String()}

	fmt.Println("Inserted Preorder: ", preorder.OfferReference)
	json.NewEncoder(w).Encode(httpResponse)
	return
}
func (users *Users) addHotel(w http.ResponseWriter, req *http.Request) {
	fmt.Println("Endpoint hit: addHotel")

	decoder := json.NewDecoder(req.Body)
	var hotel Hotel
	err := decoder.Decode(&hotel)
	if err != nil {
		panic(err)
	}

	//TODO handle offer reference column
	insertHotelCmd := fmt.Sprintf("INSERT INTO HOTELS "+
		"(Id,Name, City, Stars, Agency) VALUES "+
		"('%s', '%s','%s','%d','%s');",
		guuid.New(), hotel.Name, hotel.City, hotel.Stars, hotel.Agency)

	if _, err := users.db.Query(insertHotelCmd); err != nil {
		fmt.Println("Error inserting Hotel: %q", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	httpResponse := HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success" }

	fmt.Println("Inserted hotel: ", hotel.Name)
	json.NewEncoder(w).Encode(httpResponse)
	return
}

func (users *Users) addTourismOffer(w http.ResponseWriter, req *http.Request) {
	fmt.Println("Endpoint hit: addTourismOffer")

	decoder := json.NewDecoder(req.Body)
	var tourismOffer TourismOffer
	err := decoder.Decode(&tourismOffer)
	if err != nil {
		panic(err)
	}

	//TODO handle offer reference column
	insertOfferCmd := fmt.Sprintf("INSERT INTO TOURISM_OFFERS "+
		"(offerTitle, flyingCompany, departureCity, destinationcity, departureDate, returnDate, hotelName, offerPrice," +
		"offerDescription, travelAgency, agencyEmail, travelDuration, hotelStars, isHotOffer, agencyAddress," +
		" agencyPhone, offerReference, hotelId) VALUES "+
		"('%s', '%s','%s','%s','%s','%s','%s','%s' ,'%s','%s','%s','%d','%d','%t','%s','%s','%s','%s');",
		tourismOffer.OfferTitle, tourismOffer.FlyingCompany, tourismOffer.DepartureCity, tourismOffer.DestinationCity,
		tourismOffer.DepartureDate, tourismOffer.ReturnDate, tourismOffer.HotelName, tourismOffer.OfferPrice, tourismOffer.OfferDescription,
		tourismOffer.TravelAgency, tourismOffer.AgencyEmail, tourismOffer.TravelDuration,
		tourismOffer.HotelStars, tourismOffer.IsHotOffer, tourismOffer.AgencyAddress, tourismOffer.AgencyPhone, tourismOffer.OfferReference,
		tourismOffer.HotelId)

	if _, err := users.db.Query(insertOfferCmd); err != nil {
		fmt.Println("Error inserting offer: %q", err)
		//http.Error(w, err.Error(), http.StatusInternalServerError)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	httpResponse := HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success"}

	fmt.Println("Inserted offer: ", tourismOffer.HotelName)
	json.NewEncoder(w).Encode(httpResponse)
	return
}

func (users *Users) addOmraOffer(w http.ResponseWriter, req *http.Request) {
	fmt.Println("Endpoint hit: addOmraOffer")

	decoder := json.NewDecoder(req.Body)
	var omraOffer OmraOffer
	err := decoder.Decode(&omraOffer)
	if err != nil {
		panic(err)
	}

	//TODO handle offer reference column
	insertOfferCmd := fmt.Sprintf("INSERT INTO OMRA_OFFERS "+
		"(offertitle, flyingcompany, departurecity, destinationcity, distancefromharam, departuredate, returndate, hotelName, offerPrice, offerdescription, travelagency, Agencyemail, travelduration, hotelstars, ishotoffer, agencyaddress, agencyphone, agencylogo) VALUES "+
		"('%s', '%s','%s','%s','%s','%s','%s','%s', %s ,'%s','%s','%s','%d','%d','%t','%s','%s','%s');",
		omraOffer.OfferTitle, omraOffer.FlyingCompany, omraOffer.DepartureCity, omraOffer.DestinationCity, omraOffer.DistanceFromHaram,
		omraOffer.DepartureDate, omraOffer.ReturnDate, omraOffer.HotelName, omraOffer.OfferPrice, omraOffer.OfferDescription,
		omraOffer.TravelAgency, omraOffer.AgencyEmail, omraOffer.TravelDuration, omraOffer.HotelStars, omraOffer.IsHotOffer, omraOffer.AgencyAddress, omraOffer.AgencyPhone, omraOffer.AgencyLogo)

	if _, err := users.db.Query(insertOfferCmd); err != nil {
		fmt.Println("Error inserting offer: %q", err)
		//http.Error(w, err.Error(), http.StatusInternalServerError)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	httpResponse := HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success"}

	fmt.Println("Inserted omra offer: ", omraOffer.HotelName)
	json.NewEncoder(w).Encode(httpResponse)
	return
}

func (users *Users) getOfferByCompanyName(w http.ResponseWriter, req *http.Request) {

	companyName := URLParamAsString("companyName", req)
	fmt.Println("getOfferByCompanyName : ", companyName)

	getOfferByCompanyReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE flyingCompany LIKE '%s';", companyName)

	rows, err := users.db.Query(getOfferByCompanyReq)
	if err != nil {
		fmt.Println("Error getting offer: ", err)
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
			&tourismOffer.HotelName,
			&tourismOffer.OfferPrice,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail,
			&tourismOffer.OfferReference,
			&tourismOffer.AgencyLogo); err != nil {
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

	rows, err := users.db.Query(getOfferByCompanyReq)
	if err != nil {
		fmt.Println("Error getting all tourism offers: ", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results TourismOffers
	for rows.Next() {
		var tourismOffer TourismOffer
		if err := rows.Scan(
			&tourismOffer.FlyingCompany,
			&tourismOffer.DepartureCity,
			&tourismOffer.DestinationCity,
			&tourismOffer.HotelName,
			&tourismOffer.OfferPrice,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail,
			&tourismOffer.OfferReference,
			&tourismOffer.AgencyLogo,
			&tourismOffer.HotelId); err != nil {
			fmt.Println("error getAllTourismOffers error: ", err)
			httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	for i, result := range results {

		getOfferPhotosReq := fmt.Sprintf("SELECT photo FROM HOTEL_PHOTOS WHERE hotelId = '%s';", result.HotelId)

		photoResults := make([]string, 0)
		rows, _ := users.db.Query(getOfferPhotosReq)
		for rows.Next() {
			var photo string
			if err := rows.Scan(&photo); err != nil {
				log.Fatal(err)
			}
			photoResults = append(photoResults, photo)
		}

		results[i].HotelPhotos = append(results[i].HotelPhotos, photoResults...)
	}

	hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
	//fmt.Println("getAllTourismOffers found offers: ", hdr)
	json.NewEncoder(w).Encode(hdr)
	return
}
func (users *Users) getOffersByParameters(w http.ResponseWriter, req *http.Request) {
	fmt.Println("get All getOffersByParameters")
	hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}}
	json.NewEncoder(w).Encode(hdr)

	return
}
func (users *Users) getOfferByCity(w http.ResponseWriter, req *http.Request) {
	paramArray := []string{"departureCity", "destinationCity"}
	fmt.Println("get All getOfferByCity 2: ", GenerateSQLRequest("TOURISM_OFFERS", paramArray, req))

	//departureCity := URLParamAsString("departureCity", req)
	//destinationCity := URLParamAsString("destinationCity", req)

	//getOfferByCityReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE departureCity LIKE '%s' AND destinationCity LIKE '%s';", departureCity, destinationCity)
	getOfferByCityReq := GenerateSQLRequest("TOURISM_OFFERS", paramArray, req)
	rows, err := users.db.Query(getOfferByCityReq)
	if err != nil {
		fmt.Println("Error getting offer: ", err)
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
			&tourismOffer.HotelName,
			&tourismOffer.OfferPrice,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail,
			&tourismOffer.OfferReference,
			&tourismOffer.AgencyLogo,
			&tourismOffer.HotelId); err != nil {
			fmt.Println("error getOfferByCity error: ", err)
			httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	fmt.Println("error getOfferByCity results len: ", len(results))
	for i, result := range results {

		getOfferPhotosReq := fmt.Sprintf("SELECT photo FROM HOTEL_PHOTOS WHERE hotelId = '%s';", result.HotelId)
		fmt.Println("error getOfferByCity getOfferPhotosReq: ", getOfferPhotosReq)
		photoResults := make([]string, 0)
		rows, _ := users.db.Query(getOfferPhotosReq)
		for rows.Next() {
			var photo string
			if err := rows.Scan(&photo); err != nil {
				log.Fatal(err)
			}
			photoResults = append(photoResults, photo)
		}

		fmt.Println("error getOfferByCity photoResults: ", len(photoResults))
		results[i].HotelPhotos = append(results[i].HotelPhotos, photoResults...)
	}

	hdr := TourismOffersHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}

	fmt.Println("getOfferByCity 3: ", len(results))
	json.NewEncoder(w).Encode(hdr)

	return
}

func (users *Users) getPreorderData(w http.ResponseWriter, req *http.Request) {
	offerReference := URLParamAsString("offer_reference", req)
	preorderID := URLParamAsString("preorder_id", req)
	fmt.Println("getPreorderData : ", offerReference)

	getPreorderReq := fmt.Sprintf("SELECT * FROM PREORDER WHERE id = '%s';", preorderID)

	fmt.Println("getPreorderReq : ", getPreorderReq)

	rows, err := users.db.Query(getPreorderReq)
	if err != nil {
		fmt.Println("Error getting offer: ", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var preorders []Preorder
	for rows.Next() {
		var preorder Preorder
		if err := rows.Scan(
			&preorder.OfferReference,
			&preorder.UserFirstName,
			&preorder.UserLastName,
			&preorder.UserEmail,
			&preorder.UserPhone,
			&preorder.NumberRooms,
			&preorder.NumberAdults,
			&preorder.NumberChildren,
			&preorder.NumberBabies,
			&preorder.ComplementaryInfo,
			&preorder.Id); err != nil {
			fmt.Println("error getPreorderData error: ", err)
			httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		preorders = append(preorders, preorder)
	}

	getOfferByRefReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE offerReference LIKE '%s';", offerReference)

	rows, err = users.db.Query(getOfferByRefReq)
	if err != nil {
		fmt.Println("Error getting offer: ", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}
/*
	defer rows.Close()
	var results sdu.TourismOffers
	for rows.Next() {
		var tourismOffer sdu.TourismOffer
		if err := rows.Scan(&tourismOffer.FlyingCompany,
			&tourismOffer.DepartureCity,
			&tourismOffer.DestinationCity,
			&tourismOffer.Hotel,
			&tourismOffer.OfferPrice,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail,
			&tourismOffer.OfferReference,
			&tourismOffer.AgencyLogo,
			&tourismOffer.HotelId); err != nil {
			fmt.Println("error getPreorderData error: ", err)
			httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}*/

	var preorderData PreorderData
	//preorderData.Offer = results[0]
	preorderData.Preorder = preorders[0]

	hdr := PreorderHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: preorderData}
	json.NewEncoder(w).Encode(hdr)
	return
}

func (users *Users) getOfferByReference(w http.ResponseWriter, req *http.Request) {
	offerReference := URLParamAsString("reference", req)
	fmt.Println("getOfferByReference : ", offerReference)

	getOfferByRefReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE offerReference LIKE '%s';", offerReference)

	rows, err := users.db.Query(getOfferByRefReq)
	if err != nil {
		fmt.Println("Error getting offer: ", err)
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
			&tourismOffer.HotelName,
			&tourismOffer.OfferPrice,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail,
			&tourismOffer.OfferReference,
			&tourismOffer.AgencyLogo,
			&tourismOffer.HotelId); err != nil {
			fmt.Println("error getOfferByReference error: ", err)
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
	fmt.Println("get All getHotTourismOffers: ", req)

	keys,_ := req.URL.Query()["destinationCity"]

    fmt.Println("------- get All getHotTourismOffers keys: ", keys)
	getHotOffers := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE isHotOffer is true;")

	rows, err := users.db.Query(getHotOffers)
	if err != nil {
		fmt.Println("Error getting offer: ", err)
		httpResponse := HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results TourismOffers
	for rows.Next() {
		var tourismOffer TourismOffer
		if err := rows.Scan(
			&tourismOffer.FlyingCompany,
			&tourismOffer.DepartureCity,
			&tourismOffer.DestinationCity,
			&tourismOffer.HotelName,
			&tourismOffer.OfferPrice,
			&tourismOffer.TravelAgency,
			&tourismOffer.TravelDuration,
			&tourismOffer.HotelStars,
			&tourismOffer.IsHotOffer,
			&tourismOffer.AgencyAddress,
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail,
			&tourismOffer.OfferReference,
			&tourismOffer.AgencyLogo,
			&tourismOffer.HotelId); err != nil {
			fmt.Println("error getHotOffers error: ", err)
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

/*
func (users *Users) addAgencyLogo(w http.ResponseWriter, req *http.Request) {
	fmt.Println("get All getHotTourismOffers")

	var userToCheck, existingUser sdu.User

	json.NewDecoder(req.Body).Decode(&userToCheck)
	fmt.Println("[addUser] ", req.Body)
	// check if user email exists

	request := fmt.Sprintf("SELECT * FROM USERS WHERE username LIKE '%s';", userToCheck.Email)
	row := users.db.QueryRow(request)

	fmt.Println("[addUser] 1: ", request)
	err := row.Scan(&existingUser.Username, &existingUser.Email, &existingUser.Password)


	fmt.Println("[addUser] user exists: ", existingUser.Email)
	httpResponse := sdu.AuthenticationHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusNoContent, ResponseMessage: "Email déjà utilisé"}}
	json.NewEncoder(w).Encode(httpResponse)
	return
}
*/
func (users *Users) getUserInDB(userName string) (*User, error) {

	var existingUser User

	request := fmt.Sprintf("SELECT * FROM USERS WHERE userName LIKE '%s';", userName)
	row := users.db.QueryRow(request)

	err := row.Scan(&existingUser.Id, &existingUser.UserName, &existingUser.Password, &existingUser.FirstName, &existingUser.LastName, &existingUser.Role)

	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("[getUserInDB] user does not exist")
			return nil, nil
		}
		fmt.Println("[getUserInDB] Error on user scan: ", err)
		return nil, err
	}

	return &existingUser, nil
}

func (users *Users) getUserInDBById(id string) (*User, error) {

	var existingUser User

	request := fmt.Sprintf("SELECT * FROM USERS WHERE id = '%s';", id)
	row := users.db.QueryRow(request)

	err := row.Scan(&existingUser.Id, &existingUser.UserName, &existingUser.Password, &existingUser.FirstName, &existingUser.LastName, &existingUser.Role)

	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("[getUserInDBById] user does not exist")
			return nil, nil
		}
		fmt.Println("[getUserInDBById] Error on user scan: ", err)
		return nil, err
	}

	return &existingUser, nil
}

func (users *Users) isUserExistsInDB(userName string) (bool, error) {

	var existingUser User

	request := fmt.Sprintf("SELECT * FROM USERS WHERE username LIKE '%s';", userName)
	fmt.Println("[isUserExistsInDB] request", request)
	row := users.db.QueryRow(request)

	err := row.Scan(&existingUser.Id, &existingUser.UserName, &existingUser.Password, &existingUser.FirstName, &existingUser.LastName, &existingUser.Role)

	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("[isUserExistsInDB] user does not exist")
			return false, nil
		}
		fmt.Println("[isUserExistsInDB] Error on user scan: ", err)
		return false, err
	}

	if existingUser.UserName == userName {
		return true, nil
	} else {
		return false, nil
	}
}

func (users *Users) addUser(w http.ResponseWriter, req *http.Request) {

	var userToCheck, existingUser User

	decoder := json.NewDecoder(req.Body)
	err := decoder.Decode(&userToCheck)
	if err != nil {
		panic(err)
	}

	// check if user email exists

	request := fmt.Sprintf("SELECT * FROM USERS WHERE userName LIKE '%s';", userToCheck.UserName)
	row := users.db.QueryRow(request)

	err = row.Scan(&existingUser.Id, &existingUser.UserName, &existingUser.Password, &existingUser.FirstName, &existingUser.LastName, &existingUser.Role)

	if err != nil {
		if err == sql.ErrNoRows {
			// email not used, new user => hash password
			hashPwd, _ := bcrypt.GenerateFromPassword([]byte(userToCheck.Password), bcrypt.MinCost)

			// no user exists with that email => can add user
			userId := guuid.New();
			insertUserCmd := fmt.Sprintf("INSERT INTO USERS (id, username, firstName, lastName, password, role) " +
				"VALUES ('%s','%s','%s','%s','%s','%s');",
				userId, userToCheck.UserName, userToCheck.FirstName, userToCheck.LastName, string(hashPwd), userToCheck.Role)

			if _, err := users.db.Query(insertUserCmd); err != nil {
				fmt.Println("[addUser] Error inserting user: ", err)
				httpResponse := AuthenticationHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}
			httpResponse := AuthenticationHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "OK", Id: userId.String()}}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
	} else {
		// user exists => cannot add
		httpResponse := AuthenticationHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusNoContent, ResponseMessage: "Nom utilisateur déjà utilisé"}}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}
}

func (users *Users) authenticateUser(w http.ResponseWriter, req *http.Request) {

	fmt.Println("[authenticateUser]")

	var userToCheck AuthenticationUser

	json.NewDecoder(req.Body).Decode(&userToCheck)

	fmt.Println("[authenticateUser] ", userToCheck)

	if req.Header["Token"] != nil {
		fmt.Println("[authenticateUser] user has token: ", req.Header["Token"][0])
		// user has token
		token, err := jwt.Parse(req.Header["Token"][0], func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				fmt.Errorf("[authenticateUser] There was an error when parsing token")
				return nil, fmt.Errorf("[authenticateUser] There was an error")
			}
			return mySigningString, nil
		})

		if err != nil {
			// error happened => send http error, authentication fail
			fmt.Println("[authenticateUser] There was an error when parsing token ", err.Error())
			httpResponse := AuthenticationHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
			json.NewEncoder(w).Encode(httpResponse)
		}

		if token.Valid {
			// check that user exists in DB
			isUserExist, err := users.isUserExistsInDB(userToCheck.UserName)
			if err != nil {
				fmt.Println("[authenticateUser] error while checking user:  existence: ", userToCheck.UserName, err.Error())
				httpResponse := AuthenticationHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}
			if isUserExist {
				// token valid => send http ok with token
				userDB, _ := users.getUserInDB(userToCheck.UserName)
				userDB.Token = token.Raw
				fmt.Println("[authenticateUser] user exists, used existing token : ", token)
				httpResponse := AuthenticationHTTPResponse{
					ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK", Id: userDB.Id},
					User:        *userDB}

				json.NewEncoder(w).Encode(httpResponse)
				return
			} else {
				// user does not exists
				fmt.Println("[authenticateUser] user does not exist, need to create user account")
				httpResponse := AuthenticationHTTPResponse{
					ResponseDetails: HTTPResponse{ResponseCode: http.StatusUnauthorized, ResponseMessage: "l'email n'est pas connu, veillez vérifier l'email utilisé"}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}

			fmt.Println("[authenticateUser] Token is valid")
		}
	} else {
		// No Token is request
		// check that user exists
		fmt.Println("[authenticateUser] request without token header :", userToCheck)

		isUserExist, err := users.isUserExistsInDB(userToCheck.UserName)

		if err != nil {
			fmt.Println("[authenticateUser] error while checking user:  existence: ", userToCheck.UserName, err.Error())
			httpResponse := AuthenticationHTTPResponse{ResponseDetails: HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		if isUserExist {
			// check that password corresponds
			userDB, err := users.getUserInDB(userToCheck.UserName)
			err = bcrypt.CompareHashAndPassword([]byte(userDB.Password), []byte(userToCheck.Password))

			if err != nil {
				fmt.Println("[authenticateUser] password non corresponding")
				httpResponse := AuthenticationHTTPResponse{
					ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "NOK"}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}
			fmt.Println("[authenticateUser] password corresponding")
			// if user exists in DB => generate JWT
			newToken, err := GenerateJWT()
			if err != nil {
				fmt.Println("[authenticateUser] error generating JWT: ", err.Error())
				httpResponse := AuthenticationHTTPResponse{
					ResponseDetails: HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: "Erreur lors de la génération du token"}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}

			userDB.Token = newToken
			httpResponse := AuthenticationHTTPResponse{
				ResponseDetails: HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK", Id: userDB.Id},
				User:        *userDB}
			json.NewEncoder(w).Encode(httpResponse)
			return
		} else {
			// user does not exist => http NOK authentication failed, please create account
			fmt.Println("[authenticateUser] user does not exist, need to create user account: ", userToCheck.UserName)
			httpResponse := AuthenticationHTTPResponse{
				ResponseDetails: HTTPResponse{ResponseCode: http.StatusUnauthorized, ResponseMessage: "l'email n'est pas connu, veillez vérifier l'email utilisé"}}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}

		fmt.Fprintf(w, "[authenticateUser] Not authorized")
	}
}

func (users *Users) getUserById(w http.ResponseWriter, req *http.Request) {

	fmt.Println("[getUserById]")

	userID := URLParamAsString("id", req)

	userDB, err := users.getUserInDBById(*userID)

	if err !=nil {
		fmt.Println("[getUserById] error happened: ", err.Error())
		httpResponse := AuthenticationHTTPResponse{
			ResponseDetails: HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	json.NewEncoder(w).Encode(userDB)
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

	fmt.Println("Successfully !,", port)
	*/


	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Error opening database: %q", err)
	} else {
		fmt.Println("Successfully connected to DB! port: %q", port)
	}

	users := &Users{db: db}

	r := mux.NewRouter()
	r.HandleFunc("/tourismOffers", users.tourismOffers).Methods("GET")
	r.HandleFunc("/tourismOffers", users.addTourismOffer).Methods(http.MethodPost)
	r.HandleFunc("/addOmraOffer", users.addOmraOffer)
	r.HandleFunc("/offers/offerByName/{companyName}", users.getOfferByCompanyName).Methods("GET")
	//r.HandleFunc("/offers/departureCity/{departureCity}/destinationCity/{destinationCity}/departureDate/{departureDate}/returnDate/{returnDate}", users.getOfferByCity).Methods("GET")
	r.HandleFunc("/offers/offerByCity/{departureCity}/{destinationCity}", users.getOfferByCity).Methods("GET")
	r.HandleFunc("/offers/allTourismOffers", users.getAllTourismOffers).Methods("GET")
	r.HandleFunc("/hotTourismOffers", users.getHotTourismOffers).Methods("GET")
	r.HandleFunc("/tourismOffer/{reference}", users.getOfferByReference).Methods("GET")
	r.HandleFunc("/preorder/{offer_reference}/{preorder_id}", users.getPreorderData).Methods("GET")
	//r.HandleFunc("/addAgencyLogo", users.addAgencyLogo).Methods("POST")
	r.HandleFunc("/addHotel", users.addHotel).Methods("POST")
	r.HandleFunc("/addHotelPhoto", users.addHotelPhoto).Methods("POST")
	r.HandleFunc("/generatePreorder", users.generatePreorder).Methods("POST")

	// User management
	r.HandleFunc("/addUser", users.addUser).Methods("POST")
	r.HandleFunc("/authenticate", users.authenticateUser).Methods(http.MethodPost, http.MethodOptions)
	r.HandleFunc("/users/{id}", users.getUserById).Methods("GET")

	//log.Fatal(http.ListenAndServeTLS(":8000", "./certifs/public.cert", "./certifs/private.key", r))
	//log.Fatal(http.ListenAndServe(":"+port, handlers.CORS(handlers.AllowedOrigins([]string{"*"}))(r)))
	headers :=  handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization", "Origin", "Accept", "token"})
	methods :=  handlers.AllowedMethods([]string{"GET", "POST","OPTIONS"})
	origins := 	handlers.AllowedOrigins([]string{"*"})


	log.Fatal(http.ListenAndServe(":"+port, handlers.CORS(headers, methods, origins)(r)))

}

func main() {
	fmt.Println("hello, world")
	handleRequests()

}
