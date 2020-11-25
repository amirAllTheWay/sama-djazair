package dao

import (
	"fmt"
	"database/sql"
)

const (
	// DAOMongo is used for Mongo implementation of SpiritDAO
	DAOSql int = iota
	// DAOMock is used for mocked implementation of SpiritDAO
	DAOMock
	host     = "localhost"
    dbPort     = 5432
    user     = "postgres"
    password = "password"
    dbname   = "sama_database"
)


// GetAgencyOffersDAO returns a AgencyOffersDAO according to type and params
func GetAgencyOffersDAO(daoType int) (AgencyOffersDAO, error) {
	switch daoType {
	case DAOSql:
		
		psqlInfo := fmt.Sprintf("host=%s port=%d user=%s "+"password=%s sslmode=disable",host, dbPort, user, password)

		db, err := sql.Open("postgres", psqlInfo)
		if err != nil {
			fmt.Println("postgres connection error: ", err)
			panic(err)
		}

		defer db.Close()

		err = db.Ping()
		if err != nil {
			fmt.Println("postgres ping error: ", err)
			panic(err)
		}

		return AgencyOffersDAOSql(db), nil
	//case DAOMock:
	//	return NewSpiritDAOMock(), nil
	default:
		return nil, ErrorDAONotFound
	}
}