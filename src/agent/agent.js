import { parse, isValid } from 'date-fns';
import searchFlights from '../skills/searchFlights.js';
import analyzeSalesOpportunity from '../skills/analyzeSalesOpportunity.js';
import persistTransaction from '../skills/persistTransaction.js';
import getConversationHistory from '../skills/getConversationHistory.js';
import getRecentSearches from '../skills/getRecentSearches.js';
import { query } from '../db/pool.js';
import {
  formatResponse,
  buildHumanMessage,
} from '../services/evolutionApi.js';

// ── Intent detection keywords ───────────────────────────────
const FLIGHT_KEYWORDS = [
  'voo', 'voos', 'voar', 'flight', 'flights',
  'passagem', 'passagens', 'aérea', 'aéreo', 'aereo',
  'ida e volta', 'embarque', 'destino',
  'gru', 'gig', 'cgh', 'sdu', 'bsb', 'mia', 'jfk', 'mco', 'cdg', 'lhr',
];

/** Flag set to true when DB is confirmed unreachable. */
let dbUnavailable = false;

/**
 * Central reasoning engine.
 *
 * 1. Persists the incoming user message.
 * 2. Loads conversation history (short-term memory).
 * 3. Determines intent.
 * 4. Routes to the appropriate skill pipeline.
 * 5. Formats & returns a structured response.
 *
 * @param {object} params
 * @param {string} params.conversationId
 * @param {string} params.customerPhone
 * @param {string} params.messageContent   Raw user message
 * @returns {Promise<{humanMessage: string, systemMetadata: object}>}
 */
export async function handleMessage({ conversationId, customerPhone, messageContent }) {
  try {
    // ── 1. Ensure conversation exists & persist user message ──
    if (!dbUnavailable) {
      try {
        await ensureConversation(conversationId, customerPhone);
        await persistUserMessage(conversationId, messageContent);
      } catch (err) {
        console.warn('[Agent] DB unavailable, skipping persistence:', err.message);
        dbUnavailable = true;
      }
    }

    // ── 2. Load short-term memory ──
    const history = dbUnavailable ? [] : await getConversationHistory(conversationId);

    // ── 3. Determine intent ──
    const fullContext = [
      ...history.map((m) => m.content),
      messageContent,
    ].join(' ').toLowerCase();

    const isFlightSearch = detectFlightIntent(fullContext);

    if (isFlightSearch) {
      return await handleFlightSearch({
        conversationId,
        customerPhone,
        messageContent,
        fullContext,
      });
    }

    // ── Default response when no specific intent is detected ──
    const defaultText =
      '👋 Olá! Sou o assistente da equipe de reservas.\n\n' +
      'Posso ajudar você a buscar voos e encontrar as melhores oportunidades.\n\n' +
      'Para pesquisar um voo, me informe:\n' +
      '• Cidade/aeroporto de origem (ex: GRU)\n' +
      '• Cidade/aeroporto de destino (ex: MIA)\n' +
      '• Data da ida (ex: 15/04/2026 ou 2026-04-15)\n' +
      '• Data da volta (opcional)';

    return formatResponse({
      text: defaultText,
      opportunityLevel: 'unknown',
      suggestions: [],
      priceAnalysis: {},
      searchParams: {},
    });
  } catch (err) {
    console.error('[Agent] Error handling message:', err);
    return formatResponse({
      text: '⚠️ Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente em instantes.',
      opportunityLevel: 'unknown',
      suggestions: [],
      priceAnalysis: {},
      searchParams: {},
    });
  }
}

// ── Flight search pipeline ──────────────────────────────────

async function handleFlightSearch({ conversationId, customerPhone, messageContent, fullContext }) {
  // ── Parse flight params from context ──
  const searchParams = extractFlightParams(fullContext);

  if (!searchParams.origin || !searchParams.destination || !searchParams.departureDate) {
    const missingFields = [];
    if (!searchParams.origin) missingFields.push('origem (código IATA, ex: GRU)');
    if (!searchParams.destination) missingFields.push('destino (código IATA, ex: MIA)');
    if (!searchParams.departureDate) missingFields.push('data de ida (ex: 15/04/2026)');

    const text =
      '✈️ Para buscar seu voo, preciso das seguintes informações:\n\n' +
      missingFields.map((f) => `  • ${f}`).join('\n');

    return formatResponse({
      text,
      opportunityLevel: 'unknown',
      suggestions: [],
      priceAnalysis: {},
      searchParams,
    });
  }

  // ── Execute flight search ──
  console.log(`[Agent] Searching flights: ${searchParams.origin} → ${searchParams.destination} on ${searchParams.departureDate}`);

  const flightResults = await searchFlights(searchParams);

  // ── Load historical prices for comparison ──
  let historicalPrices = [];
  if (!dbUnavailable) {
    try {
      historicalPrices = await getRecentSearches({
        origin: searchParams.origin,
        destination: searchParams.destination,
      });
    } catch {
      // Non-fatal — historical data is a nice-to-have
    }
  }

  // ── Analyse sales opportunity ──
  const opportunity = analyzeSalesOpportunity({
    bestFlight: flightResults.bestFlight,
    cheapestFlight: flightResults.cheapestFlight,
    destination: searchParams.destination,
    historicalPrices,
  });

  // ── Build human-readable message ──
  const humanText = buildHumanMessage({
    bestFlight: flightResults.bestFlight,
    cheapestFlight: flightResults.cheapestFlight,
    origin: searchParams.origin,
    destination: searchParams.destination,
    departureDate: searchParams.departureDate,
    returnDate: searchParams.returnDate,
    opportunityLevel: opportunity.opportunityLevel,
    suggestions: opportunity.suggestions,
  });

  // ── Persist everything ──
  if (!dbUnavailable) {
    try {
      await persistTransaction({
        conversationId,
        customerPhone,
        searchParams,
        bestFlight: flightResults.bestFlight,
        cheapestFlight: flightResults.cheapestFlight,
        rawResponse: { allFlights: flightResults.allFlights },
        salesOpportunity: opportunity,
        assistantMessage: humanText,
      });
    } catch (err) {
      console.error('[Agent] Persistence failed (non-fatal):', err.message);
    }
  }

  return formatResponse({
    text: humanText,
    opportunityLevel: opportunity.opportunityLevel,
    suggestions: opportunity.suggestions,
    priceAnalysis: opportunity.priceAnalysis,
    searchParams,
  });
}

// ── Intent detection ────────────────────────────────────────

function detectFlightIntent(text) {
  return FLIGHT_KEYWORDS.some((kw) => text.includes(kw));
}

// ── Smarter parameter extraction ────────────────────────────

/**
 * Best-effort extraction of flight params from natural language.
 * Supports:
 *   - 3-letter IATA codes (GRU, MIA)
 *   - ISO dates (2026-04-15)
 *   - Brazilian dates (15/04/2026)
 */
function extractFlightParams(text) {
  // Match 3-letter uppercase IATA codes
  const iataCodes = text.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [];

  // Filter common words that happen to be 3 letters
  const stopWords = new Set([
    'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL',
    'CAN', 'HAD', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY',
    'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW',
    'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'DID', 'LET', 'SAY',
    'SHE', 'TOO', 'USE', 'DAD', 'MOM', 'SOU', 'COM', 'QUE',
    'POR', 'UMA', 'DOS', 'DAS', 'NOS', 'VOO', 'IDA', 'DIA',
    'MEU', 'SEM', 'MAS', 'FAZ', 'TEM', 'VOU', 'SER', 'TAM',
  ]);

  const validIata = iataCodes.filter((c) => !stopWords.has(c));

  // ── Date extraction ──
  const dates = extractDates(text);

  return {
    origin: validIata[0] ?? null,
    destination: validIata[1] ?? null,
    departureDate: dates[0] ?? null,
    returnDate: dates[1] ?? null,
  };
}

/**
 * Extract dates from text, supporting both ISO (2026-04-15) and
 * Brazilian (15/04/2026) formats. Returns ISO date strings.
 */
function extractDates(text) {
  const dates = [];

  // ISO dates: 2026-04-15
  const isoMatches = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  for (const m of isoMatches) {
    const d = parse(m, 'yyyy-MM-dd', new Date());
    if (isValid(d)) dates.push(m);
  }

  // Brazilian dates: 15/04/2026
  const brMatches = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? [];
  for (const m of brMatches) {
    const d = parse(m, 'dd/MM/yyyy', new Date());
    if (isValid(d)) {
      // Convert to ISO
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
  }

  return dates;
}

// ── DB Helpers ──────────────────────────────────────────────

async function ensureConversation(conversationId, customerPhone) {
  await query(
    `INSERT INTO conversations (id, customer_phone, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [conversationId, customerPhone],
  );
}

async function persistUserMessage(conversationId, content) {
  await query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [conversationId, content],
  );
}
