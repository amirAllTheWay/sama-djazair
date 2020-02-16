package model

type TourismOffer struct {
    FlyingCompany string `json:flyingCompany`
    DepartureCity string `json:departureCity`
    DestinationCity string `json:destinationCity`
    Hotel string `json:hotel`
    Price string `json:price`
    HotelImage string `json:hotelImage`
}


type TourismOffers []TourismOffer

type HttpResponse struct {
    ResponseCode int `json:responseCode`
    ResponseMessage string `json:responseMessage`
}

type TourismOffersHttpResponse struct {
    Hr HttpResponse `json:httpResponse`
    To TourismOffers `json:tourismOffers`
}