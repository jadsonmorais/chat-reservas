import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getSerpApiClient } from '../services/serpApi.js';

/**
 * Search for flights using SerpApi Google Flights engine.
 *
 * @param {object} params
 * @param {string} params.origin          IATA code (e.g. "GRU")
 * @param {string} params.destination     IATA code (e.g. "MIA")
 * @param {string} params.departureDate   ISO date string (YYYY-MM-DD)
 * @param {string} [params.returnDate]    ISO date string (optional — one-way if omitted)
 * @param {string} [params.currency]      Currency code (default "BRL")
 * @returns {Promise<{bestFlight: object|null, cheapestFlight: object|null, allFlights: object[]}>}
 */
export default async function searchFlights({
  origin,
  destination,
  departureDate,
  returnDate = null,
  currency = 'BRL',
}) {
  const client = getSerpApiClient();

  // ── Normalise dates to UTC to avoid timezone drift ──
  const departureDateNorm = normaliseDate(departureDate);
  const returnDateNorm = returnDate ? normaliseDate(returnDate) : undefined;

  // ── Build engine-specific params ──
  const searchParams = {
    departure_id: origin.toUpperCase(),
    arrival_id: destination.toUpperCase(),
    outbound_date: departureDateNorm,
    currency,
    hl: 'pt-br',
    gl: 'br',
    type: returnDateNorm ? '1' : '2',  // 1 = round-trip, 2 = one-way
  };

  if (returnDateNorm) {
    searchParams.return_date = returnDateNorm;
  }

  // ── Call SerpApi with retry ──
  const data = await fetchWithRetry(client, searchParams, 2);

  // ── Extract best & cheapest flights ──
  const bestFlights = data.best_flights ?? [];
  const otherFlights = data.other_flights ?? [];
  const allFlights = [...bestFlights, ...otherFlights];

  const bestFlight = bestFlights[0] ?? null;
  const cheapestFlight = findCheapest(allFlights);

  return {
    bestFlight,
    cheapestFlight,
    allFlights,
    searchMetadata: {
      origin,
      destination,
      departureDate: departureDateNorm,
      returnDate: returnDateNorm ?? null,
      currency,
      totalResults: allFlights.length,
      searchedAt: new Date().toISOString(),
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Normalise a date string to YYYY-MM-DD in UTC.
 */
function normaliseDate(dateStr) {
  const parsed = parseISO(dateStr);
  const utc = toZonedTime(parsed, 'UTC');
  return format(utc, 'yyyy-MM-dd');
}

/**
 * Find the cheapest flight in a list by total price.
 */
function findCheapest(flights) {
  if (flights.length === 0) return null;

  return flights.reduce((cheapest, flight) => {
    const currentPrice = flight.price ?? Infinity;
    const cheapestPrice = cheapest.price ?? Infinity;
    return currentPrice < cheapestPrice ? flight : cheapest;
  }, flights[0]);
}

/**
 * Retry wrapper using SerpApiClient.
 * Retries on network errors and 5xx responses.
 */
async function fetchWithRetry(client, params, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await client.search('google_flights', params);
    } catch (err) {
      const is5xx = err.message?.includes('HTTP 5');
      const isRetryable = is5xx || err.name === 'TypeError'; // network error

      if (isRetryable && attempt < retries) {
        console.warn(`[searchFlights] Attempt ${attempt + 1} failed. Retrying…`);
        await delay(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
