---
name: google-flights-skill
description: Specialized skill for Google Flights via SerpApi. Use for flight searches, airline comparison, and airport/city autocompletion.
vm0_secrets:
  - SERPAPI_TOKEN
---

# Google Flights Skill

Specialized tool for searching flights using SerpApi's `google_flights` engine. Provides real-time pricing, schedules, and various filtering options.

> Official docs: `https://serpapi.com/google-flights-api`

---

## When to Use

Use this skill when you need to:

- **Search for flights** (one-way, round-trip, or multi-city)
- **Compare flight prices** and durations
- **Filter results** by stops, airlines, class, or times
- **Find airport/city codes** (IATA or KGMID) using autocomplete

---

## Prerequisites

1. Ensure the environment variable `SERPAPI_TOKEN` is set.
2. Use `jq` for parsing the JSON output.

---

## How to Use

### 1. Basic Round-Trip Search
Search for flights between two airports on specific dates:

```bash
bash -c 'curl -s "https://serpapi.com/search?engine=google_flights&departure_id=GRU&arrival_id=FOR&outbound_date=2026-06-15&return_date=2026-06-22&currency=BRL&api_key=${SERPAPI_TOKEN}"' | jq ".best_flights[:3]"
```

### 2. One-Way Search with Filters
Search for one-way economy flights under a certain duration:

```bash
bash -c 'curl -s "https://serpapi.com/search?engine=google_flights&departure_id=CDG&arrival_id=JFK&outbound_date=2026-05-10&type=2&travel_class=1&max_duration=600&currency=EUR&api_key=${SERPAPI_TOKEN}"' | jq ".other_flights[:3]"
```

### 3. Autocomplete for Airport/City Codes
Find the correct `departure_id` or `arrival_id`:

```bash
bash -c 'curl -s "https://serpapi.com/search?engine=google_flights_autocomplete&q=Fortaleza&api_key=${SERPAPI_TOKEN}"' | jq ".suggestions[] | {name, id}"
```

---

## Key Parameters

| Parameter | Description |
|-----------|-------------|
| `departure_id` | 3-letter IATA code or KGMID for departure |
| `arrival_id` | 3-letter IATA code or KGMID for arrival |
| `outbound_date` | Date in `YYYY-MM-DD` format |
| `return_date` | Date in `YYYY-MM-DD` format (for round-trips) |
| `type` | `1`: Round-trip (default), `2`: One-way, `3`: Multi-city |
| `travel_class` | `1`: Economy, `2`: Premium economy, `3`: Business, `4`: First |
| `stops` | `0`: All (default), `1`: Non-stop, `2`: 1 stop or less |
| `currency` | Currency code (e.g., `BRL`, `USD`, `EUR`) |

---

## Scripts

This skill includes helper scripts in the `./scripts` directory:

- `flights.sh`: Formatted flight search
- `autocomplete.sh`: Quick ID retrieval for locations

---

## Guidelines

1. **Use Autocomplete First**: If you only have a city name, use `google_flights_autocomplete` to get the correct IATA/KGMID.
2. **Handle Currency**: Always specify `currency=BRL` when dealing with Brazilian users for consistency.
3. **Parse `best_flights`**: SerpApi separates "Best Flights" (quality/price balance) from "Other Flights". Focus on `best_flights` first.
4. **Time Buffers**: When searching, remember that SerpApi results are real-time but may take a few seconds to fetch.
