package dao

import (
	sdm "sama-djazair/model"
)

const (
	// NoPaging used with skip, limit parameters
	NoPaging = -1
)

// SpiritDAO is the DAO interface to work with spirits
type AgencyOffersDAO interface {

	// GetSpiritByID returns a spirit by its ID
	getOfferByCompanyName(companyName string) (*sdm.TourismOffersHttpResponse, error)

}