import { getClient } from '../db/pool.js';

/**
 * Persist a flight search transaction in a single DB transaction.
 *
 * Inserts into both `flight_searches` and `messages` tables.
 *
 * @param {object} params
 * @param {string} params.conversationId   Conversation identifier
 * @param {string} params.customerPhone    Customer phone number
 * @param {object} params.searchParams     { origin, destination, departureDate, returnDate }
 * @param {object} params.bestFlight       Best flight result (JSONB)
 * @param {object} params.cheapestFlight   Cheapest flight result (JSONB)
 * @param {object} params.rawResponse      Full SerpApi response (JSONB)
 * @param {object} params.salesOpportunity Sales opportunity analysis (JSONB)
 * @param {string} params.assistantMessage The formatted reply sent to the user
 */
export default async function persistTransaction({
  conversationId,
  customerPhone,
  searchParams,
  bestFlight,
  cheapestFlight,
  rawResponse,
  salesOpportunity,
  assistantMessage,
}) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // ── Upsert conversation ──
    await client.query(
      `INSERT INTO conversations (id, customer_phone, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      [conversationId, customerPhone],
    );

    // ── Insert flight search record ──
    await client.query(
      `INSERT INTO flight_searches
         (conversation_id, origin, destination, departure_date, return_date,
          best_flight, cheapest_flight, raw_response, sales_opportunity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        conversationId,
        searchParams.origin,
        searchParams.destination,
        searchParams.departureDate,
        searchParams.returnDate ?? null,
        JSON.stringify(bestFlight),
        JSON.stringify(cheapestFlight),
        JSON.stringify(rawResponse),
        JSON.stringify(salesOpportunity),
      ],
    );

    // ── Log the assistant message ──
    await client.query(
      `INSERT INTO messages (conversation_id, role, content, metadata)
       VALUES ($1, 'assistant', $2, $3)`,
      [
        conversationId,
        assistantMessage,
        JSON.stringify({
          type: 'flight_search',
          origin: searchParams.origin,
          destination: searchParams.destination,
        }),
      ],
    );

    await client.query('COMMIT');

    console.log(`[persistTransaction] Saved flight search for conversation ${conversationId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[persistTransaction] Transaction rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
