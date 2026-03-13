/**
 * Evolution API integration — message sending & response formatting.
 */

/**
 * Send a text message via Evolution API.
 *
 * @param {string} phone   Recipient phone (e.g. "5511999999999@s.whatsapp.net")
 * @param {string} text    Message content
 * @param {string} [instanceName]  Evolution API instance name
 */
export async function sendMessage(phone, text, instanceName) {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = instanceName ?? process.env.EVOLUTION_INSTANCE_NAME;

  if (!baseUrl || !apiKey || !instance) {
    throw new Error('[EvolutionApi] Missing EVOLUTION_API_URL, EVOLUTION_API_KEY, or EVOLUTION_INSTANCE_NAME');
  }

  const url = `${baseUrl}/message/sendText/${instance}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: phone,
      text,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[EvolutionApi] HTTP ${res.status}: ${body}`);
  }

  return res.json();
}

// ── Output Parser ───────────────────────────────────────────

/**
 * Format an agent response into a clean structure separating
 * the human-readable message from system metadata.
 *
 * @param {object} params
 * @param {string} params.text              Human-readable message
 * @param {string} params.opportunityLevel  "high" | "medium" | "low" | "unknown"
 * @param {string[]} params.suggestions     Upsell suggestions
 * @param {object} params.priceAnalysis     Price analysis object
 * @param {object} params.searchParams      Original search params
 * @returns {{ humanMessage: string, systemMetadata: object }}
 */
export function formatResponse({
  text,
  opportunityLevel,
  suggestions,
  priceAnalysis,
  searchParams,
}) {
  return {
    humanMessage: text,
    systemMetadata: {
      type: 'flight_search_response',
      opportunityLevel,
      suggestions,
      priceAnalysis,
      searchParams,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Build the human-readable text message from flight results.
 *
 * @param {object} params
 * @param {object|null} params.bestFlight
 * @param {object|null} params.cheapestFlight
 * @param {string} params.origin
 * @param {string} params.destination
 * @param {string} params.departureDate
 * @param {string} [params.returnDate]
 * @param {string} params.opportunityLevel
 * @param {string[]} params.suggestions
 * @returns {string}
 */
export function buildHumanMessage({
  bestFlight,
  cheapestFlight,
  origin,
  destination,
  departureDate,
  returnDate,
  opportunityLevel,
  suggestions,
}) {
  const lines = [];

  lines.push(`✈️ *Resultado da busca de voos*`);
  lines.push(`📍 ${origin} → ${destination}`);
  lines.push(`📅 Ida: ${departureDate}${returnDate ? ` | Volta: ${returnDate}` : ' (somente ida)'}`);
  lines.push('');

  if (bestFlight) {
    lines.push(`🏆 *Melhor Voo:*`);
    lines.push(formatFlightSummary(bestFlight));
    lines.push('');
  }

  if (cheapestFlight && cheapestFlight !== bestFlight) {
    lines.push(`💰 *Voo Mais Barato:*`);
    lines.push(formatFlightSummary(cheapestFlight));
    lines.push('');
  }

  if (!bestFlight && !cheapestFlight) {
    lines.push('⚠️ Nenhum voo encontrado para essa rota e data.');
    return lines.join('\n');
  }

  // Opportunity badge
  const badge = {
    high: '🟢 OPORTUNIDADE ALTA',
    medium: '🟡 OPORTUNIDADE MÉDIA',
    low: '🔴 OPORTUNIDADE BAIXA',
    unknown: '⚪ SEM DADOS',
  }[opportunityLevel] ?? '⚪ SEM DADOS';

  lines.push(`📊 *Análise:* ${badge}`);
  lines.push('');

  if (suggestions.length > 0) {
    lines.push('💡 *Sugestões de venda:*');
    suggestions.forEach((s) => lines.push(`  • ${s}`));
  }

  return lines.join('\n');
}

// ── Internal helpers ────────────────────────────────────────

function formatFlightSummary(flight) {
  const legs = flight.flights ?? [];
  const parts = [];

  if (flight.price != null) {
    parts.push(`💵 R$ ${flight.price}`);
  }

  if (flight.total_duration != null) {
    const h = Math.floor(flight.total_duration / 60);
    const m = flight.total_duration % 60;
    parts.push(`⏱️ ${h}h${m > 0 ? m + 'min' : ''}`);
  }

  if (legs.length > 0) {
    const airlines = [...new Set(legs.map((l) => l.airline).filter(Boolean))];
    if (airlines.length) parts.push(`🛩️ ${airlines.join(', ')}`);

    const stops = legs.length - 1;
    parts.push(stops === 0 ? 'Direto' : `${stops} escala(s)`);
  }

  return parts.join(' | ');
}
