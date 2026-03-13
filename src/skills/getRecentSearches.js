import { query } from '../db/pool.js';

const MAX_HISTORY = 5;

/**
 * Retrieve the most recent flight searches for a given route.
 * Used to provide historical price context to the sales opportunity analysis.
 *
 * @param {object} params
 * @param {string} params.origin       IATA origin code
 * @param {string} params.destination  IATA destination code
 * @param {number} [params.limit]      Max records to return (default 5)
 * @returns {Promise<Array<{price: number|null, departureDate: string, searchedAt: string}>>}
 */
export default async function getRecentSearches({
  origin,
  destination,
  limit = MAX_HISTORY,
}) {
  if (!origin || !destination) return [];

  try {
    const result = await query(
      `SELECT
         cheapest_flight->>'price' AS price,
         departure_date            AS "departureDate",
         created_at                AS "searchedAt"
       FROM flight_searches
       WHERE origin = $1 AND destination = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [origin.toUpperCase(), destination.toUpperCase(), limit],
    );

    return result.rows.map((row) => ({
      price: row.price != null ? Number(row.price) : null,
      departureDate: row.departureDate,
      searchedAt: row.searchedAt,
    }));
  } catch (err) {
    console.error('[getRecentSearches] Failed:', err.message);
    return [];
  }
}
