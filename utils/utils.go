package utils

import (
	"fmt"
	"github.com/gorilla/mux"
	"net/http"
)

// URLParamAsString returns an URL parameter /{name} as a string
func URLParamAsString(name string, r *http.Request) string {
	vars := mux.Vars(r)
	fmt.Println("URLParamAsString : ", vars)
	value := vars[name]
	return value
}

// TourismOffer represent a unit offer for tourism
type TourismOffer struct {
	OfferTitle       string `json:"offerTitle"`
	FlyingCompany    string `json:"flyingCompany"`
	DepartureCity    string `json:"departureCity"`
	DestinationCity  string `json:"destinationCity"`
	DepartureDate    string `json:"departureDate"`
	ReturnDate       string `json:"returnDate"`
	Hotel            string `json:"hotelName"`
	Price            string `json:"offerPrice"`
	OfferDescription string `json:"offerDescription"`
	HotelImage       string `json:"hotelImage"`
	TravelAgency     string `json:"travelAgency"`
	AgencyEmail      string `json:"AgencyEmail"`
	TravelDuration   int    `json:"travelDuration"`
	HotelStars       int    `json:"hotelStars"`
	IsHotOffer       bool   `json:"isHotOffer"`
	AgencyAddress    string `json:"agencyAddress"`
	AgencyPhone      string `json:"agencyPhone"`
	OfferReference   string `json:"offerReference"`
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
	Hotel             string `json:"hotelName"`
	Price             string `json:"offerPrice"`
	OfferDescription  string `json:"offerDescription"`
	HotelImage        string `json:"hotelImage"`
	TravelAgency      string `json:"travelAgency"`
	AgencyEmail       string `json:"AgencyEmail"`
	TravelDuration    int    `json:"travelDuration"`
	HotelStars        int    `json:"hotelStars"`
	IsHotOffer        bool   `json:"isHotOffer"`
	AgencyAddress     string `json:"agencyAddress"`
	AgencyPhone       string `json:"agencyPhone"`
}

// TourismOffers is list of tourism offers
type TourismOffers []TourismOffer

// TourismOffersHTTPResponse represents data for tourism offers
type TourismOffersHTTPResponse struct {
	ResponseDetails HTTPResponse  `json:"httpResponse"`
	Data            TourismOffers `json:"tourismOffers"`
}

type User struct {
	Username string `json:username`
	Email    string `json:email`
	Password string `json:password`
}

// HTTPResponse represents generic http response
type HTTPResponse struct {
	ResponseCode    int    `json:"responseCode"`
	ResponseMessage string `json:"responseMessage"`
}

type AuthenticationData struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Token    string `json:"token"`
}

type AuthenticationHTTPResponse struct {
	AuthData        AuthenticationData `json:"authData"`
	ResponseDetails HTTPResponse       `json:"httpResponse"`
}
