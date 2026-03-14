#!/bin/bash

# Helper script for Google Flights Autocomplete via SerpApi
# Usage: ./autocomplete.sh QUERY

QUERY=$1

if [ -z "$QUERY" ]; then
  echo "Usage: $0 QUERY"
  echo "Example: $0 Fortaleza"
  exit 1
fi

curl -s "https://serpapi.com/search?engine=google_flights_autocomplete&q=${QUERY}&api_key=${SERPAPI_TOKEN}" | jq '.suggestions[] | {name, id}'
