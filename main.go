package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	jwt "github.com/dgrijalva/jwt-go"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	bcrypt "golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"os"
	sdu "sama-djazair/utils"
)

// Users represent connection to sql DB
type Users struct {
	db *sql.DB
}

var mySigningString = []byte("mysupersecretphrase")

const (
	host     = "localhost"
	dbPort   = 5432
	user     = "postgres"
	password = "password"
	dbname   = "sama_database"
)

func allTourismOffers(w http.ResponseWriter, r *http.Request) {
	offers := sdu.TourismOffers{
		sdu.TourismOffer{FlyingCompany: "Air Algérie", DepartureCity: "Alger", DestinationCity: "Rome", Hotel: "Sheraton", Price: "350€"},
	}

	fmt.Println("Endpoint hit: All tourism offers endpoint")
	json.NewEncoder(w).Encode(offers)
}

func (users *Users) addTourismOffer(w http.ResponseWriter, req *http.Request) {
	fmt.Println("Endpoint hit: addTourismOffer")

	decoder := json.NewDecoder(req.Body)
	var tourismOffer sdu.TourismOffer
	err := decoder.Decode(&tourismOffer)
	if err != nil {
		panic(err)
	}

	insertOfferCmd := fmt.Sprintf("INSERT INTO TOURISM_OFFERS "+
		"(offertitle, flyingcompany, departurecity, destinationcity, departuredate, returndate, hotel, price, offerdescription, hotelimage, travelagency, Agencyemail, travelduration, hotelstars, ishotoffer, agencyaddress, agencyphone) VALUES "+
		"('%s', '%s','%s','%s','%s','%s','%s','%s' ,'%s','%s','%s','%s','%d','%d','%t','%s','%s');",
		tourismOffer.OfferTitle, tourismOffer.FlyingCompany, tourismOffer.DepartureCity, tourismOffer.DestinationCity,
		tourismOffer.DepartureDate, tourismOffer.ReturnDate, tourismOffer.Hotel, tourismOffer.Price, tourismOffer.OfferDescription, tourismOffer.HotelImage,
		tourismOffer.TravelAgency, tourismOffer.AgencyEmail, tourismOffer.TravelDuration, tourismOffer.HotelStars, tourismOffer.IsHotOffer, tourismOffer.AgencyAddress, tourismOffer.AgencyPhone)

	if _, err := users.db.Query(insertOfferCmd); err != nil {
		fmt.Println("Error inserting offer: %q", err)
		//http.Error(w, err.Error(), http.StatusInternalServerError)
		httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "success"}

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
		fmt.Println("Error getting offer: ", err)
		httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results sdu.TourismOffers
	for rows.Next() {
		var tourismOffer sdu.TourismOffer
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
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail); err != nil {
			fmt.Println("error getOfferByCompanyName error: ", err)
			httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := sdu.TourismOffersHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
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
		fmt.Println("Error getting all tourism offers: ", err)
		httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results sdu.TourismOffers
	for rows.Next() {
		var tourismOffer sdu.TourismOffer
		if err := rows.Scan(
			&tourismOffer.FlyingCompany,
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
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail); err != nil {
			fmt.Println("error getAllTourismOffers error: ", err)
			httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := sdu.TourismOffersHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
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
		fmt.Println("Error getting offer: ", err)
		httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results sdu.TourismOffers
	for rows.Next() {
		var tourismOffer sdu.TourismOffer
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
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail); err != nil {
			fmt.Println("error getOfferByCity error: ", err)
			httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := sdu.TourismOffersHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
	json.NewEncoder(w).Encode(hdr)

	return
}

func (users *Users) getHotTourismOffers(w http.ResponseWriter, req *http.Request) {
	fmt.Println("get All getHotTourismOffers")

	getHotOffers := fmt.Sprintf("SELECT * FROM TOURISM_OFFERS WHERE ishotoffer is true;")

	fmt.Println("select command: ", getHotOffers)
	rows, err := users.db.Query(getHotOffers)
	if err != nil {
		fmt.Println("Error getting offer: ", err)
		httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}

	defer rows.Close()
	var results sdu.TourismOffers
	for rows.Next() {
		var tourismOffer sdu.TourismOffer
		if err := rows.Scan(
			&tourismOffer.FlyingCompany,
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
			&tourismOffer.AgencyPhone,
			&tourismOffer.OfferTitle,
			&tourismOffer.DepartureDate,
			&tourismOffer.ReturnDate,
			&tourismOffer.OfferDescription,
			&tourismOffer.AgencyEmail,
		); err != nil {
			fmt.Println("error getHotOffers error: ", err)
			httpResponse := sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		results = append(results, tourismOffer)
	}

	hdr := sdu.TourismOffersHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"}, Data: results}
	json.NewEncoder(w).Encode(hdr)

	fmt.Println("select command: ", w)

	return
}

func (users *Users) getUserInDB(emailToCheck string) (*sdu.User, error) {

	var existingUser sdu.User

	request := fmt.Sprintf("SELECT * FROM USERS WHERE email LIKE '%s';", emailToCheck)
	row := users.db.QueryRow(request)

	err := row.Scan(&existingUser.Username, &existingUser.Email, &existingUser.Password)

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

func (users *Users) isUserExistsInDB(emailToCheck string) (bool, error) {

	var existingUser sdu.User

	request := fmt.Sprintf("SELECT * FROM USERS WHERE email LIKE '%s';", emailToCheck)
	row := users.db.QueryRow(request)

	err := row.Scan(&existingUser.Username, &existingUser.Email, &existingUser.Password)

	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("[isUserExistsInDB] user does not exist")
			return false, nil
		}
		fmt.Println("[isUserExistsInDB] Error on user scan: ", err)
		return false, err
	}

	if existingUser.Email == emailToCheck {
		return true, nil
	} else {
		return false, nil
	}
}

func (users *Users) addUser(w http.ResponseWriter, req *http.Request) {

	var userToCheck, existingUser sdu.User

	json.NewDecoder(req.Body).Decode(&userToCheck)
	fmt.Println("[addUser] ", req.Body)
	// check if user email exists

	request := fmt.Sprintf("SELECT * FROM USERS WHERE email LIKE '%s';", userToCheck.Email)
	row := users.db.QueryRow(request)

	fmt.Println("[addUser] 1: ", request)
	err := row.Scan(&existingUser.Username, &existingUser.Email, &existingUser.Password)

	if err != nil {
		fmt.Printf("[addUser] 2 %q", err)
		if err == sql.ErrNoRows {
			// email not used, new user => hash password
			hashPwd, _ := bcrypt.GenerateFromPassword([]byte(userToCheck.Password), 10)

			fmt.Printf("[addUser] 3")
			// no user exists with that email => can add user
			insertUserCmd := fmt.Sprintf("INSERT INTO USERS (username, email, password) VALUES ('%s','%s','%s');",
				userToCheck.Username, userToCheck.Email, hashPwd)

			if _, err := users.db.Query(insertUserCmd); err != nil {
				fmt.Println("[addUser] Error inserting user: ", err)
				httpResponse := sdu.AuthenticationHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}
			fmt.Println("[addUser] user added: ", insertUserCmd)
			httpResponse := sdu.AuthenticationHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusCreated, ResponseMessage: "OK"}}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
	} else {
		// user exists => cannot add
		fmt.Println("[addUser] user exists: ", existingUser.Email)
		httpResponse := sdu.AuthenticationHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusNoContent, ResponseMessage: "Email déjà utilisé"}}
		json.NewEncoder(w).Encode(httpResponse)
		return
	}
}

func (users *Users) authenticateUser(w http.ResponseWriter, req *http.Request) {

	fmt.Println("[authenticateUser]")
	var userToCheck sdu.User

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
			httpResponse := sdu.AuthenticationHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
			json.NewEncoder(w).Encode(httpResponse)
		}

		if token.Valid {
			// check that user exists in DB
			isUserExist, err := users.isUserExistsInDB(userToCheck.Email)
			if err != nil {
				fmt.Println("[authenticateUser] error while checking user:  existence: ", userToCheck.Email, err.Error())
				httpResponse := sdu.AuthenticationHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}
			if isUserExist {
				// token valid => send http ok with token
				fmt.Println("[authenticateUser] user exists, used existing token : ", token)
				httpResponse := sdu.AuthenticationHTTPResponse{
					ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusOK},
					AuthData:        sdu.AuthenticationData{Username: userToCheck.Username, Email: userToCheck.Email, Token: token.Raw}}

				json.NewEncoder(w).Encode(httpResponse)
				return
			} else {
				// user does not exists
				fmt.Println("[authenticateUser] user does not exist, need to create user account")
				httpResponse := sdu.AuthenticationHTTPResponse{
					ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusUnauthorized, ResponseMessage: "l'email n'est pas connu, veillez vérifier l'email utilisé"}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}

			fmt.Println("[authenticateUser] Token is valid")
		}
	} else {
		// No Token is request
		// check that user exists
		fmt.Println("[authenticateUser] request without token header :", userToCheck.Email)

		isUserExist, err := users.isUserExistsInDB(userToCheck.Email)
		if err != nil {
			fmt.Println("[authenticateUser] error while checking user:  existence: ", userToCheck.Email, err.Error())
			httpResponse := sdu.AuthenticationHTTPResponse{ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: err.Error()}}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}
		if isUserExist {
			// check that password corresponds
			userDB, err := users.getUserInDB(userToCheck.Email)
			err = bcrypt.CompareHashAndPassword([]byte(userDB.Password), []byte(userToCheck.Password))

			if err != nil {
				fmt.Println("[authenticateUser] password non corresponding")
				httpResponse := sdu.AuthenticationHTTPResponse{
					ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "NOK"}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}
			fmt.Println("[authenticateUser] password corresponding")
			// if user exists in DB => generate JWT
			newToken, err := sdu.GenerateJWT()
			if err != nil {
				fmt.Println("[authenticateUser] error generating JWT: ", err.Error())
				httpResponse := sdu.AuthenticationHTTPResponse{
					ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusInternalServerError, ResponseMessage: "Erreur lors de la génération du token"}}
				json.NewEncoder(w).Encode(httpResponse)
				return
			}

			fmt.Println("[authenticateUser] user exists, generated token : ", newToken)

			httpResponse := sdu.AuthenticationHTTPResponse{
				ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusOK, ResponseMessage: "OK"},
				AuthData:        sdu.AuthenticationData{Username: userToCheck.Username, Email: userToCheck.Email, Token: newToken}}
			json.NewEncoder(w).Encode(httpResponse)
			return
		} else {
			// user does not exist => http NOK authentication failed, please create account
			fmt.Println("[authenticateUser] user does not exist, need to create user account: ", userToCheck.Email)
			httpResponse := sdu.AuthenticationHTTPResponse{
				ResponseDetails: sdu.HTTPResponse{ResponseCode: http.StatusUnauthorized, ResponseMessage: "l'email n'est pas connu, veillez vérifier l'email utilisé"}}
			json.NewEncoder(w).Encode(httpResponse)
			return
		}

		fmt.Fprintf(w, "[authenticateUser] Not authorized")
	}
}
func homePage(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Homepage Endpoint hit")
}

func handleRequests() {

	port := os.Getenv("PORT")

	if port == "" {
		port = "8000"
	}
	
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
	
		/*
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Error opening database: %q", err)
	} else {
		fmt.Println("Successfully connected to DB!")
	}*/

	users := &Users{db: db}

	r := mux.NewRouter()
	r.HandleFunc("/tourismOffers", allTourismOffers)
	r.HandleFunc("/addTourismOffer", users.addTourismOffer)
	r.HandleFunc("/getOffers/getOfferByName/{companyName}", users.getOfferByCompanyName).Methods("GET")
	r.HandleFunc("/getOffers/getOfferByCity/{departureCity}/{destinationCity}", users.getOfferByCity).Methods("GET")
	r.HandleFunc("/getOffers/allTourismOffers", users.getAllTourismOffers).Methods("GET")
	r.HandleFunc("/getHotTourismOffers", users.getHotTourismOffers).Methods("GET")

	// User management
	r.HandleFunc("/addUser", users.addUser).Methods("POST")
	r.HandleFunc("/authenticate", users.authenticateUser).Methods("POST")

	//log.Fatal(http.ListenAndServeTLS(":8000", "./certifs/public.cert", "./certifs/private.key", r))
	log.Fatal(http.ListenAndServe(":"+port, handlers.CORS(handlers.AllowedOrigins([]string{"*"}))(r)))

}

func main() {
	fmt.Println("hello, world")
	handleRequests()

}
