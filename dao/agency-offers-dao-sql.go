package dao

import (
	"database/sql"
	"net/http"
	"fmt"
	"encoding/json"
	sdu "sama-djazair/utils"
	sdm "sama-djazair/model"
)

// AgencyOffersDAOSql is the sql implementation of the AgencyOffersDAO
type AgencyOffersDAOSql struct {
	db *sql.DB
}

// NewSpiritDAOMongo creates a new SpiritDAO mongo implementation
func NewSpiritDAOMongo(db *sql.DB) AgencyOffersDAO {
	
	return &AgencyOffersDAOSql{db: db}
}

func (s *AgencyOffersDAOSql)  getOfferByCompanyName(w http.ResponseWriter, req *http.Request) {
    
    companyName := sdu.URLParamAsString("companyName", req)
    fmt.Println("getOfferByCompanyName : ", companyName)

    getOfferByCompanyReq := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS '%s';", companyName)

    fmt.Println("select command: ", getOfferByCompanyReq)
    rows, err := s.db.Query(getOfferByCompanyReq)
    if err != nil {
            fmt.Printf("Error getting offer: %q", err)
            httpResponse := sdm.HttpResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
            json.NewEncoder(w).Encode(httpResponse)
            return
    }

    defer rows.Close()
    var tf sdm.TourismOffers
    for rows.Next() {
        var tourisOffer sdm.TourismOffer
        if err := rows.Scan(&tourisOffer); err != nil {
            fmt.Println("error getOfferByCompanyName error: ", err)
            httpResponse := sdm.HttpResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
            json.NewEncoder(w).Encode(httpResponse)
            return
        }
        tf = append(tf, tourisOffer)
    }

    fmt.Printf("getOfferByCompanyName found offers: %v", tf)
    response := sdm.TourismOffersHttpResponse{httpResponse: sdm.HttpResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, tourismOffers: tf}

    json.NewEncoder(w).Encode(response)
    return
}