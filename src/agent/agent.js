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
  'ida e volta', 'embarque', 'destino', 'oportunidade', 'hubs',
  'gru', 'gig', 'cgh', 'sdu', 'bsb', 'mia', 'jfk', 'mco', 'cdg', 'lhr', 'for',
  'fortaleza', 'ceara', 'ceará',
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
  // ── 1. Strict Parameter Priority ──
  // We extract from current message ONLY for fields that should be "fresh"
  const currentParams = extractFlightParams(messageContent);
  const contextParams = extractFlightParams(fullContext);

  // Intent: If the user didn't mention a return date in the latest message, 
  // we assume a one-way search OR they are changing the scope. 
  // We only fallback to context for things NOT usually specified in every single msg (like phone).
  const searchParams = {
    origin: currentParams.origin || contextParams.origin,
    destination: currentParams.destination || contextParams.destination,
    departureDate: currentParams.departureDate || (isDateInMsg(messageContent) ? null : contextParams.departureDate),
    returnDate: currentParams.returnDate || null, // Never fallback return date unless explicitly in msg
  };

  // ── 2. Hub / Multi-origin detection ──
  const HUB_KEYWORDS = ['HUBS', 'PRINCIPAIS', 'TODOS', 'CAPITAIS', 'BRASIL'];
  const isMultiHub = HUB_KEYWORDS.some(kw => messageContent.toUpperCase().includes(kw));
  const hubs = ['GRU', 'BSB', 'GIG', 'CNF', 'VCP', 'REC', 'SSA'];

  // ── 3. Hub logic: If multi-hub, the detected code is likely the destination ──
  if (isMultiHub && currentParams.origin && !currentParams.destination) {
    searchParams.destination = currentParams.origin; // Swap
    searchParams.origin = null;
  }

  // Parameter Validation fallback
  if (!searchParams.destination && contextParams.destination) searchParams.destination = contextParams.destination;

  // ── 4. Execution ──
  const origins = isMultiHub ? hubs : [searchParams.origin].filter(Boolean);

  if (origins.length === 0 || !searchParams.destination || !searchParams.departureDate) {
    const missingFields = [];
    if (origins.length === 0) missingFields.push('origem (ex: GRU ou "principais hubs")');
    if (!searchParams.destination) missingFields.push('destino (ex: FOR)');
    if (!searchParams.departureDate) missingFields.push('data de ida (ex: 15/05/2026)');

    const text = '✈️ Para realizar a análise técnica, preciso dessas informações:\n\n' +
                 missingFields.map(f => `  • ${f}`).join('\n');

    return formatResponse({ text, opportunityLevel: 'unknown', suggestions: [], priceAnalysis: {}, searchParams });
  }

  console.log(`[Agent] Executing ${origins.length} searches for ${searchParams.destination} on ${searchParams.departureDate}`);

  // ── 5. Concurrent Search ──
  const results = await Promise.all(origins.map(async (origin) => {
    try {
      const flightResults = await searchFlights({ ...searchParams, origin });
      
      let historicalPrices = [];
      if (!dbUnavailable) {
        historicalPrices = await getRecentSearches({ origin, destination: searchParams.destination }).catch(() => []);
      }

      const opportunity = analyzeSalesOpportunity({
        bestFlight: flightResults.bestFlight,
        cheapestFlight: flightResults.cheapestFlight,
        destination: searchParams.destination,
        historicalPrices,
      });

      return { origin, flightResults, opportunity };
    } catch (err) {
      console.error(`[Agent] Search failed for ${origin}:`, err.message);
      return { origin, error: err.message };
    }
  }));

  // ── 6. Aggregate Response ──
  const humanText = buildHumanMessage({
    multiResults: results,
    destination: searchParams.destination,
    departureDate: searchParams.departureDate,
    returnDate: searchParams.returnDate
  });

  // ── 7. Global Persistence ──
  if (!dbUnavailable) {
    try {
      const bestGlobal = results.find(r => r.opportunity?.opportunityLevel === 'high') || results[0];
      if (bestGlobal && !bestGlobal.error) {
        await persistTransaction({
          conversationId,
          customerPhone,
          searchParams: { ...searchParams, origin: bestGlobal.origin },
          bestFlight: bestGlobal.flightResults.bestFlight,
          cheapestFlight: bestGlobal.flightResults.cheapestFlight,
          rawResponse: { resultsCount: results.length },
          salesOpportunity: bestGlobal.opportunity,
          assistantMessage: humanText,
        });
      }
    } catch (err) {
      console.error('[Agent] Persistence failed:', err.message);
    }
  }

  return formatResponse({
    text: humanText,
    opportunityLevel: results.some(r => r.opportunity?.opportunityLevel === 'high') ? 'high' : 'medium',
    suggestions: results.flatMap(r => r.opportunity?.suggestions || []).slice(0, 5),
    priceAnalysis: { multiHub: true, totalSearches: results.length },
    searchParams,
  });
}

function isDateInMsg(text) {
  return /\b\d{4}-\d{2}-\d{2}\b/.test(text) || /\b\d{2}\/\d{2}\/\d{4}\b/.test(text);
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
  const upperText = text.toUpperCase();
  let codes = extractIataCodes(text);

  // ── Precise "PARA" (TO) Detection ──
  // If we find "PARA [CITY]", that city MUST be the destination
  const paraMatch = upperText.match(/PARA\s+([A-ZÀ-Úa-zà-ú]+)/);
  let paraIata = null;
  if (paraMatch) {
    const city = paraMatch[1];
    if (city === 'FORTALEZA') paraIata = 'FOR';
    if (city === 'BRASILIA' || city === 'BRASÍLIA') paraIata = 'BSB';
    if (city === 'RIO' || city === 'GIG') paraIata = 'GIG';
    if (city === 'SAO PAULO' || city === 'SÃO PAULO' || city === 'GRU') paraIata = 'GRU';
  }

  // ── City to IATA Mapping (General) ──
  if (upperText.includes('FORTALEZA') && !codes.includes('FOR')) codes.push('FOR');
  if ((upperText.includes('SÃO PAULO') || upperText.includes('SAO PAULO')) && !codes.includes('GRU')) codes.push('GRU');
  if (upperText.includes('RIO DE JANEIRO') && !codes.includes('GIG')) codes.push('GIG');

  // If we found a "PARA" destination, ensure it's in the second slot or correctly assigned
  if (paraIata) {
    codes = codes.filter(c => c !== paraIata); // Remove if already there
    codes.splice(1, 0, paraIata); // Insert as second element (destination)
  }

  // ── Date extraction ──
  const dates = extractDates(text);

  // Deduplicate while preserving order
  const uniqueIata = [...new Set(codes)];

  return {
    origin: uniqueIata[0] ?? null,
    destination: uniqueIata[1] ?? null,
    departureDate: dates[0] ?? null,
    returnDate: dates[1] ?? null,
  };
}

/**
 * Internal helper to get all valid IATA codes from a string.
 */
function extractIataCodes(text) {
  // Match 3-letter uppercase IATA codes
  const iataCodes = text.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [];

  // Filter common words that happen to be 3 letters
  const stopWords = new Set([
    'THE', 'AND', 'ARE', 'BUT', 'NOT', 'YOU',
    'CAN', 'HAD', 'HER', 'WAS', 'ONE', 'OUR', 'OUT',
    'HAS', 'HIM', 'HIS', 'HOW', 'ITS',
    'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'DID', 'LET',
    'SHE', 'TOO', 'USE', 'DAD', 'MOM', 'SOU', 'COM', 'QUE',
    'POR', 'UMA', 'DOS', 'DAS', 'NOS', 'IDA', 'DIA', 'VOO', 'VER',
    'MEU', 'SEM', 'MAS', 'FAZ', 'TEM', 'VOU', 'SER', 'TAM', 'GOL', 'AZU', 'LAT',
  ]);

  return iataCodes.filter((c) => !stopWords.has(c));
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
