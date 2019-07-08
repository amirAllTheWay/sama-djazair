package utils

import (
	"github.com/gorilla/mux"
	"net/http"
	"fmt"
)

// URLParamAsString returns an URL parameter /{name} as a string
func URLParamAsString(name string, r *http.Request) string {
	vars := mux.Vars(r)
	fmt.Println("URLParamAsString : ", vars)
	value := vars[name]
	return value
}