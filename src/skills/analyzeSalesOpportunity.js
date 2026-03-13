/**
 * Analyse a flight search result and generate upsell / sales recommendations.
 *
 * This is a PURE LOGIC skill — no I/O.
 *
 * @param {object} params
 * @param {object|null} params.bestFlight        Best flight from SerpApi
 * @param {object|null} params.cheapestFlight    Cheapest flight from SerpApi
 * @param {string}      params.destination       IATA destination code
 * @param {Array}       [params.historicalPrices] Past prices from getRecentSearches
 * @returns {{ opportunityLevel: string, suggestions: string[], priceAnalysis: object }}
 */
export default function analyzeSalesOpportunity({
  bestFlight,
  cheapestFlight,
  destination,
  historicalPrices = [],
}) {
  const priceLow = parseInt(process.env.PRICE_THRESHOLD_LOW ?? '300', 10);
  const priceMedium = parseInt(process.env.PRICE_THRESHOLD_MEDIUM ?? '600', 10);

  const price = cheapestFlight?.price ?? bestFlight?.price ?? null;

  if (price === null) {
    return {
      opportunityLevel: 'unknown',
      suggestions: ['Não foi possível determinar o preço. Verificar manualmente.'],
      priceAnalysis: { price: null, thresholds: { low: priceLow, medium: priceMedium } },
    };
  }

  const suggestions = [];
  let opportunityLevel;

  if (price <= priceLow) {
    // ── Great deal — high opportunity ──
    opportunityLevel = 'high';
    suggestions.push(
      `✈️ Voo muito barato (${formatCurrency(price)})! Oportunidade de fechar rápido.`,
      `🏨 Sugerir upgrade de quarto — o cliente está economizando no aéreo.`,
      `🍾 Oferecer pacote de experiência premium (spa, jantar, transfer privativo).`,
      `📦 Propor combo voo + hotel com margem extra para o resort.`,
    );
  } else if (price <= priceMedium) {
    // ── Fair price — medium opportunity ──
    opportunityLevel = 'medium';
    suggestions.push(
      `✈️ Preço justo (${formatCurrency(price)}). Boa janela de venda.`,
      `🏨 Oferecer upgrade de categoria com desconto de cortesia.`,
      `🚗 Sugerir transfer aeroporto–hotel como valor agregado.`,
    );
  } else {
    // ── Expensive — lower opportunity, but still worth offering value ──
    opportunityLevel = 'low';
    suggestions.push(
      `✈️ Voo com preço elevado (${formatCurrency(price)}).`,
      `💡 Destacar flexibilidade de datas para buscar tarifas menores.`,
      `🎁 Oferecer crédito no resort como incentivo de fechamento.`,
    );
  }

  // ── Historical price comparison ──
  const historicalAnalysis = analyseHistoricalPrices(price, historicalPrices);
  if (historicalAnalysis.suggestion) {
    suggestions.push(historicalAnalysis.suggestion);
  }

  // Upgrade opportunity level if history shows this is a great deal
  if (historicalAnalysis.percentDiff != null && historicalAnalysis.percentDiff <= -15) {
    if (opportunityLevel === 'medium') opportunityLevel = 'high';
    if (opportunityLevel === 'low') opportunityLevel = 'medium';
  }

  // ── Destination-specific tips ──
  const destinationTips = getDestinationTip(destination);
  if (destinationTips) {
    suggestions.push(destinationTips);
  }

  return {
    opportunityLevel,
    suggestions,
    priceAnalysis: {
      price,
      currency: 'BRL',
      thresholds: { low: priceLow, medium: priceMedium },
      bestFlightPrice: bestFlight?.price ?? null,
      cheapestFlightPrice: cheapestFlight?.price ?? null,
      savingsVsBest:
        bestFlight?.price && cheapestFlight?.price
          ? bestFlight.price - cheapestFlight.price
          : null,
      historical: historicalAnalysis,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Compare current price against historical average.
 */
function analyseHistoricalPrices(currentPrice, historicalPrices) {
  const validPrices = historicalPrices
    .map((h) => h.price)
    .filter((p) => p != null && !Number.isNaN(p));

  if (validPrices.length === 0) {
    return { averagePrice: null, percentDiff: null, suggestion: null };
  }

  const averagePrice = Math.round(
    validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length,
  );

  const percentDiff = Math.round(
    ((currentPrice - averagePrice) / averagePrice) * 100,
  );

  let suggestion = null;

  if (percentDiff <= -15) {
    suggestion = `📉 Preço ${Math.abs(percentDiff)}% abaixo da média histórica (${formatCurrency(averagePrice)}) — ótima oportunidade!`;
  } else if (percentDiff <= -5) {
    suggestion = `📊 Preço ${Math.abs(percentDiff)}% abaixo da média (${formatCurrency(averagePrice)}) — momento favorável.`;
  } else if (percentDiff >= 15) {
    suggestion = `📈 Preço ${percentDiff}% acima da média (${formatCurrency(averagePrice)}) — sugerir datas alternativas.`;
  } else if (percentDiff >= 5) {
    suggestion = `📊 Preço ${percentDiff}% acima da média (${formatCurrency(averagePrice)}) — dentro da faixa normal.`;
  }

  return { averagePrice, percentDiff, suggestion, sampleSize: validPrices.length };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Return a contextual tip based on known popular destinations.
 */
function getDestinationTip(iata) {
  const tips = {
    MIA: '🌴 Miami — sugerir passeio de barco em Biscayne Bay.',
    MCO: '🎢 Orlando — oferecer ingressos de parques como add-on.',
    CDG: '🗼 Paris — sugerir experiência gastronômica ou cruzeiro no Sena.',
    FCO: '🏛️ Roma — oferecer tour guiado pelo Vaticano.',
    LIS: '🇵🇹 Lisboa — sugerir passeio de tuk-tuk + degustação de vinhos.',
    CUN: '🏖️ Cancún — sugerir pacote all-inclusive com upgrade.',
    DXB: '🕌 Dubai — oferecer desert safari ou passeio de helicóptero.',
    JFK: '🗽 Nova York — oferecer ingressos para Broadway.',
    LHR: '🇬🇧 Londres — sugerir afternoon tea experience.',
  };
  return tips[iata?.toUpperCase()] ?? null;
}
