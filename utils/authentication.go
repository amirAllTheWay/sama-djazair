package utils

import (
	"fmt"
	"time"
	jwt "github.com/dgrijalva/jwt-go"
)

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
