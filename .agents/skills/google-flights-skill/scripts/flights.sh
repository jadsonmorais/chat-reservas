#!/bin/bash

# Helper script for Google Flights search via SerpApi
# Usage: ./flights.sh DEPARTURE ARRIVAL OUT_DATE [RETURN_DATE] [TYPE]

DEP=$1
ARR=$2
OUT=$3
RET=$4
TYPE=${5:-1}

if [ -z "$DEP" ] || [ -z "$ARR" ] || [ -z "$OUT" ]; then
  echo "Usage: $0 DEPARTURE ARRIVAL OUT_DATE [RETURN_DATE] [TYPE]"
  echo "Example: $0 GRU FOR 2026-06-15 2026-06-22"
  exit 1
fi

URL="https://serpapi.com/search?engine=google_flights&departure_id=${DEP}&arrival_id=${ARR}&outbound_date=${OUT}&currency=BRL"

if [ "$TYPE" == "1" ]; then
    URL="${URL}&return_date=${RET}"
fi

URL="${URL}&api_key=${SERPAPI_TOKEN}"

curl -s "$URL" | jq '.best_flights | map({
    airline: .flights[0].airline,
    flight_number: .flights[0].flight_number,
    departure: .flights[0].departure_airport.name,
    arrival: .flights[0].arrival_airport.name,
    departure_time: .flights[0].departure_airport.time,
    arrival_time: .flights[0].arrival_airport.time,
    duration: .total_duration,
    price: .price,
    type: (if .type == "round_trip" then "Ida e Volta" else "Somente Ida" end)
})'
