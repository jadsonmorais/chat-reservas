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
 * Supports both single-origin and multi-hub results.
 */
export function buildHumanMessage({
  bestFlight,
  cheapestFlight,
  multiResults, // Array of { origin, flightResults, opportunity }
  destination,
  departureDate,
  returnDate,
  opportunityLevel,
  suggestions,
}) {
  const lines = [];

  lines.push(`🚀 *ANÁLISE TÉCNICA DE MALHA AÉREA*`);
  lines.push(`🎯 Destino: *${destination.toUpperCase()}*`);
  lines.push(`📅 Período: ${departureDate}${returnDate ? ` até ${returnDate}` : ' (Somente Ida)'}`);
  lines.push('────────────────────────');

  if (multiResults && multiResults.length > 0) {
    // ── Multi-Hub Aggregation ──
    const successfulResults = multiResults.filter(r => !r.error && (r.flightResults.bestFlight || r.flightResults.cheapestFlight));
    
    if (successfulResults.length === 0) {
      lines.push('⚠️ Nenhuma opção viável encontrada nos principais hubs para estas datas.');
      return lines.join('\n');
    }

    // Sort by price to find the global best deal
    const globalOptions = successfulResults.map(r => ({
      origin: r.origin,
      price: r.flightResults.cheapestFlight?.price || r.flightResults.bestFlight?.price,
      opportunity: r.opportunity,
      flight: r.flightResults.cheapestFlight || r.flightResults.bestFlight
    })).sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

    const bestGlobal = globalOptions[0];

    lines.push(`🌟 *MELHOR OPORTUNIDADE GLOBAL*`);
    lines.push(`📍 Origem: *${bestGlobal.origin}*`);
    lines.push(`💰 Preço: ${formatCurrency(bestGlobal.price)}`);
    lines.push(`📊 Status: ${getEmojiBadge(bestGlobal.opportunity.opportunityLevel)}`);
    lines.push('');
    lines.push('📋 *RESUMO POR HUB (MÉDIA DE PREÇO)*');
    
    successfulResults.forEach(res => {
      const p = res.flightResults.cheapestFlight?.price || res.flightResults.bestFlight?.price;
      const status = getEmojiBadge(res.opportunity.opportunityLevel);
      lines.push(`${status} *${res.origin}*: ${p ? formatCurrency(p) : 'N/A'}`);
    });

    lines.push('');
    lines.push('💡 *INSIGHTS E ESTRATÉGIA DE CONVERSÃO*');
    
    // Aggregate distinct suggestions
    const allSuggestions = [...new Set(successfulResults.flatMap(r => r.opportunity.suggestions))];
    allSuggestions.slice(0, 4).forEach(s => lines.push(` • ${s}`));

  } else {
    // ── Single Result (Legacy/Specific) ──
    lines.push(`📍 Rota: *${multiResults?.[0]?.origin || 'Origem'}* → *${destination}*`);
    lines.push('');

    if (bestFlight) {
      lines.push(`🏆 *Opção Recomendada:*`);
      lines.push(formatFlightSummary(bestFlight));
      lines.push('');
    }

    const badge = getEmojiBadge(opportunityLevel);
    lines.push(`📊 *Análise de Mercado:* ${badge}`);
    lines.push('');

    if (suggestions && suggestions.length > 0) {
      lines.push('💡 *Direcionamento de Venda:*');
      suggestions.forEach((s) => lines.push(` • ${s}`));
    }
  }

  return lines.join('\n');
}

function getEmojiBadge(level) {
  return {
    high: '🟢 ALTA',
    medium: '🟡 MÉDIA',
    low: '🔴 BAIXA',
    unknown: '⚪ N/A',
  }[level] ?? '⚪ N/A';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
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
