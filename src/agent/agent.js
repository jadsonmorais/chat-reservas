/**
 * agent.js — Motor de raciocínio comercial
 *
 * Fluxos disponíveis (acessíveis via menu ou keywords):
 *   1. MARKET_OVERVIEW  — voos de todos os hubs → FOR (default: próxima sexta)
 *   2. COMPETITIVE      — FOR vs destinos concorrentes (mesmo hub, mesma data)
 *   3. BEST_WINDOW      — varre próximas 2 semanas e ranqueia por preço
 *   4. HUB_RANKING      — ranking de preços por hub para uma data
 *   5. CUSTOM           — busca específica com origem/destino/data livres
 */

import { addDays, format } from 'date-fns';
import { parse as parseDateFns, isValid } from 'date-fns';
import searchFlights from '../skills/searchFlights.js';
import searchCompetitors from '../skills/searchCompetitors.js';
import analyzeSalesOpportunity from '../skills/analyzeSalesOpportunity.js';
import persistTransaction from '../skills/persistTransaction.js';
import getConversationHistory from '../skills/getConversationHistory.js';
import getRecentSearches from '../skills/getRecentSearches.js';
import { query } from '../db/pool.js';
import { formatResponse, buildHumanMessage } from '../services/evolutionApi.js';
import {
  insightMarketOverview,
  insightCompetitive,
  insightBestWindow,
} from '../services/claudeService.js';

// ── Configurações ────────────────────────────────────────────

const HUBS = ['GRU', 'BSB', 'GIG', 'CNF', 'VCP', 'REC', 'SSA'];
const OUR_DESTINATION = 'FOR';

const MENU_TEXT =
  '👋 *Assistente Comercial — Chat Reservas*\n\n' +
  'O que deseja analisar?\n\n' +
  '1️⃣ *Mercado hoje* — voos para Fortaleza de todos os hubs\n' +
  '2️⃣ *Radar competitivo* — Fortaleza vs destinos de luxo concorrentes\n' +
  '3️⃣ *Melhor janela* — dias mais baratos nas próximas 2 semanas\n' +
  '4️⃣ *Ranking de hubs* — qual cidade tem o voo mais barato agora\n' +
  '5️⃣ *Busca específica* — origem, destino e data personalizados\n\n' +
  'Responda com o número ou descreva o que precisa.';

// ── Estado global simples ────────────────────────────────────

let dbUnavailable = false;

// ── Entry point ──────────────────────────────────────────────

export async function handleMessage({ conversationId, customerPhone, messageContent }) {
  try {
    if (!dbUnavailable) {
      try {
        await ensureConversation(conversationId, customerPhone);
        await persistUserMessage(conversationId, messageContent);
      } catch (err) {
        console.warn('[Agent] DB unavailable:', err.message);
        dbUnavailable = true;
      }
    }

    const history = dbUnavailable ? [] : await getConversationHistory(conversationId);
    const intent = detectIntent(messageContent, history);

    console.log(`[Agent] Intent: ${intent} | Message: "${messageContent.slice(0, 60)}"`);

    let response;
    switch (intent) {
      case 'GREETING':
        response = _respond(MENU_TEXT);
        break;

      case 'MARKET_OVERVIEW':
        response = await handleMarketOverview({ conversationId, customerPhone, messageContent });
        break;

      case 'COMPETITIVE':
        response = await handleCompetitive({ conversationId, customerPhone, messageContent });
        break;

      case 'BEST_WINDOW':
        response = await handleBestWindow({ conversationId, customerPhone, messageContent });
        break;

      case 'HUB_RANKING':
        response = await handleHubRanking({ conversationId, customerPhone, messageContent });
        break;

      case 'CUSTOM':
      default:
        response = await handleCustomSearch({ conversationId, customerPhone, messageContent, history });
        break;
    }

    // Persiste resposta do assistente para que o próximo detectIntent funcione corretamente
    if (!dbUnavailable && response?.humanMessage) {
      try {
        await query(
          `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
          [conversationId, response.humanMessage],
        );
      } catch (err) {
        console.warn('[Agent] Failed to persist assistant message:', err.message);
      }
    }

    return response;
  } catch (err) {
    console.error('[Agent] Unhandled error:', err);
    return _respond('⚠️ Ocorreu um erro ao processar sua solicitação. Tente novamente.');
  }
}

// ── Intent Detection ─────────────────────────────────────────

export function detectIntent(text, history) {
  const lower = text.toLowerCase().trim();

  // Se o último bot message foi o menu → roteamento por número
  const lastBot = [...history].reverse().find((h) => h.role === 'assistant');
  const menuActive = lastBot?.content?.includes('1️⃣');

  if (menuActive) {
    if (/^1$|^1️⃣/.test(lower)) return 'MARKET_OVERVIEW';
    if (/^2$|^2️⃣/.test(lower)) return 'COMPETITIVE';
    if (/^3$|^3️⃣/.test(lower)) return 'BEST_WINDOW';
    if (/^4$|^4️⃣/.test(lower)) return 'HUB_RANKING';
    if (/^5$|^5️⃣/.test(lower)) return 'CUSTOM';
  }

  // Keywords diretas
  if (has(lower, ['concorrentes', 'competidores', 'radar competitivo', 'comparar', ' vs ', 'versus'])) return 'COMPETITIVE';
  if (has(lower, ['melhor janela', 'janela', 'quando captar', 'captação', 'captacao', 'melhores dias', 'calendário', 'calendario'])) return 'BEST_WINDOW';
  if (has(lower, ['ranking', 'mais barato', 'menor preço', 'mais em conta', 'mais econômico'])) return 'HUB_RANKING';
  if (has(lower, ['mercado hoje', 'mercado', 'todos os hubs', 'fortaleza hoje'])) return 'MARKET_OVERVIEW';

  // Saudação simples → menu
  const words = lower.split(/\s+/);
  const greetings = new Set(['oi', 'olá', 'ola', 'menu', 'ajuda', 'help', 'start', 'início', 'inicio', 'hi', 'hey', 'bom dia', 'boa tarde', 'boa noite']);
  if (words.length <= 3 && (greetings.has(lower) || greetings.has(words[0]))) return 'GREETING';

  // Busca com IATA ou termos de voo → busca customizada
  if (has(lower, ['voo', 'voos', 'passagem', 'passagens', 'aérea', 'aereo', 'flight', 'for', 'gru', 'gig', 'bsb', 'fortaleza'])) return 'CUSTOM';

  return 'GREETING';
}

function has(text, keywords) {
  return keywords.some((kw) => text.includes(kw));
}

// ── 1. MARKET OVERVIEW — todos os hubs → FOR ────────────────

async function handleMarketOverview({ messageContent }) {
  const date = extractDate(messageContent) ?? getNextFriday();
  const dateLabel = formatDateLabel(date);

  const lines = [
    `✈️ *MERCADO — ${OUR_DESTINATION} — ${dateLabel}*`,
    `📍 Buscando ${HUBS.length} hubs simultaneamente...`,
    '────────────────────────',
  ];

  const results = await Promise.all(
    HUBS.map(async (hub) => {
      try {
        const res = await searchFlights({ origin: hub, destination: OUR_DESTINATION, departureDate: date });
        const price = res.cheapestFlight?.price ?? res.bestFlight?.price ?? null;
        const opportunity = analyzeSalesOpportunity({
          bestFlight: res.bestFlight,
          cheapestFlight: res.cheapestFlight,
          destination: OUR_DESTINATION,
          historicalPrices: [],
        });
        return { origin: hub, price, level: opportunity.opportunityLevel, error: null };
      } catch (err) {
        return { origin: hub, price: null, level: 'unknown', error: err.message };
      }
    }),
  );

  const valid = results.filter((r) => r.price).sort((a, b) => a.price - b.price);
  const failed = results.filter((r) => !r.price);

  if (valid.length === 0) {
    return _respond('⚠️ Nenhum resultado encontrado para essa data. Tente outra data.');
  }

  lines.push('');
  lines.push('🏆 *RANKING POR PREÇO*');
  valid.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    lines.push(`${medal} *${r.origin}* → ${formatCurrency(r.price)}  ${badge(r.level)}`);
  });

  if (failed.length > 0) {
    lines.push('');
    lines.push(`⚠️ Sem resultado: ${failed.map((r) => r.origin).join(', ')}`);
  }

  // Claude insight
  const aiInsight = await insightMarketOverview({ results: valid, destination: OUR_DESTINATION, date: dateLabel });
  if (aiInsight) {
    lines.push('');
    lines.push('🤖 *ANÁLISE IA*');
    lines.push(aiInsight);
  } else {
    const best = valid[0];
    lines.push('');
    lines.push('💡 *ESTRATÉGIA*');
    lines.push(` • Hub prioritário: ${best.origin} (R$${best.price})`);
    lines.push(levelStrategy(best.level));
  }

  return _respond(lines.join('\n'));
}

// ── 2. COMPETITIVE — FOR vs concorrentes ────────────────────

async function handleCompetitive({ conversationId, messageContent }) {
  const date = extractDate(messageContent) ?? getNextFriday();
  const dateLabel = formatDateLabel(date);

  // Hub padrão: GRU. Se usuário mencionou outro, usa ele.
  const origin = extractIataCode(messageContent, HUBS) ?? 'GRU';

  const lines = [
    `📡 *RADAR COMPETITIVO — ${origin} — ${dateLabel}*`,
    '────────────────────────',
  ];

  const { our, competitors } = await searchCompetitors({ origin, departureDate: date });

  const ourPrice = our.price;
  lines.push('');
  lines.push(`🏠 *NOSSO DESTINO*`);
  lines.push(
    ourPrice
      ? `✅ Fortaleza/Ceará — ${formatCurrency(ourPrice)}`
      : '❌ Fortaleza — sem resultado',
  );
  lines.push('');
  lines.push('🎯 *DESTINOS CONCORRENTES*');

  const withPrice = competitors.filter((c) => c.price).sort((a, b) => a.price - b.price);
  const noResult = competitors.filter((c) => !c.price);

  withPrice.forEach((c) => {
    const diff = ourPrice ? c.price - ourPrice : null;
    const diffStr = diff != null ? (diff > 0 ? ` (+${formatCurrency(diff)})` : ` (${formatCurrency(diff)})`) : '';
    const cheaper = diff != null && diff < 0 ? '⚠️' : '✅';
    lines.push(`${cheaper} ${c.name} — ${formatCurrency(c.price)}${diffStr}`);
  });

  if (noResult.length > 0) {
    lines.push(`⚪ Sem dado: ${noResult.map((c) => c.name).join(', ')}`);
  }

  // Posicionamento
  if (ourPrice) {
    const cheaper = withPrice.filter((c) => c.price < ourPrice);
    lines.push('');
    lines.push('📊 *POSICIONAMENTO*');
    if (cheaper.length === 0) {
      lines.push(`✅ Fortaleza é o destino mais acessível. Oportunidade de captação alta.`);
    } else {
      lines.push(`⚠️ ${cheaper.length} destino(s) com voo mais barato que Fortaleza nessa data.`);
    }
  }

  // Claude insight
  const aiInsight = await insightCompetitive({
    forResult: our,
    competitors: withPrice,
    origin,
    date: dateLabel,
  });
  if (aiInsight) {
    lines.push('');
    lines.push('🤖 *ANÁLISE IA*');
    lines.push(aiInsight);
  }

  return _respond(lines.join('\n'), conversationId);
}

// ── 3. BEST WINDOW — próximas 2 semanas ─────────────────────

async function handleBestWindow({ conversationId, messageContent }) {
  const origin = extractIataCode(messageContent, HUBS) ?? 'GRU';

  const lines = [
    `📅 *MELHOR JANELA DE CAPTAÇÃO*`,
    `🛫 Hub: *${origin}* → Fortaleza`,
    `📆 Próximas 2 semanas`,
    '────────────────────────',
  ];

  // Gera próximos 14 dias
  const today = new Date();
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i + 1);
    return { iso: format(d, 'yyyy-MM-dd'), label: formatDateLabel(format(d, 'yyyy-MM-dd')) };
  });

  lines.push('🔍 Buscando preços para os próximos 14 dias...');

  const windows = await Promise.all(
    dates.map(async ({ iso, label }) => {
      try {
        const res = await searchFlights({ origin, destination: OUR_DESTINATION, departureDate: iso });
        const price = res.cheapestFlight?.price ?? res.bestFlight?.price ?? null;
        const opportunity = analyzeSalesOpportunity({
          bestFlight: res.bestFlight,
          cheapestFlight: res.cheapestFlight,
          destination: OUR_DESTINATION,
          historicalPrices: [],
        });
        return { date: iso, dateLabel: label, price, level: opportunity.opportunityLevel };
      } catch {
        return { date: iso, dateLabel: label, price: null, level: 'unknown' };
      }
    }),
  );

  const valid = windows.filter((w) => w.price).sort((a, b) => a.price - b.price);

  if (valid.length === 0) {
    return _respond('⚠️ Não foi possível obter preços para as próximas 2 semanas. Tente novamente.');
  }

  // Remove a linha de "buscando"
  lines.pop();

  lines.push('');
  lines.push('🏆 *TOP 5 DATAS PARA CAPTAÇÃO*');
  valid.slice(0, 5).forEach((w, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    lines.push(`${medal} ${w.dateLabel} — ${formatCurrency(w.price)}  ${badge(w.level)}`);
  });

  const highCount = valid.filter((w) => w.level === 'high').length;
  const mediumCount = valid.filter((w) => w.level === 'medium').length;

  lines.push('');
  lines.push('📊 *RESUMO DA JANELA*');
  lines.push(`🟢 Alta oportunidade: ${highCount} dia(s)`);
  lines.push(`🟡 Média: ${mediumCount} dia(s)`);
  lines.push(`🔴 Baixa: ${valid.length - highCount - mediumCount} dia(s)`);

  // Claude insight
  const aiInsight = await insightBestWindow({ windows: valid, origin });
  if (aiInsight) {
    lines.push('');
    lines.push('🤖 *ANÁLISE IA*');
    lines.push(aiInsight);
  } else if (valid[0]) {
    lines.push('');
    lines.push(`💡 Melhor data: *${valid[0].dateLabel}* (${formatCurrency(valid[0].price)})`);
  }

  return _respond(lines.join('\n'), conversationId);
}

// ── 4. HUB RANKING — todos hubs, uma data ───────────────────

async function handleHubRanking({ conversationId, messageContent }) {
  const date = extractDate(messageContent) ?? getNextFriday();
  const dateLabel = formatDateLabel(date);

  const lines = [
    `🏅 *RANKING DE HUBS — ${OUR_DESTINATION} — ${dateLabel}*`,
    '────────────────────────',
  ];

  const results = await Promise.all(
    HUBS.map(async (hub) => {
      try {
        const res = await searchFlights({ origin: hub, destination: OUR_DESTINATION, departureDate: date });
        const price = res.cheapestFlight?.price ?? res.bestFlight?.price ?? null;
        const opp = analyzeSalesOpportunity({ bestFlight: res.bestFlight, cheapestFlight: res.cheapestFlight, destination: OUR_DESTINATION, historicalPrices: [] });
        return { origin: hub, price, level: opp.opportunityLevel };
      } catch {
        return { origin: hub, price: null, level: 'unknown' };
      }
    }),
  );

  const sorted = results.filter((r) => r.price).sort((a, b) => a.price - b.price);
  const noResult = results.filter((r) => !r.price);

  sorted.forEach((r, i) => {
    const pos = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}°`;
    lines.push(`${pos} *${r.origin}* — ${formatCurrency(r.price)}  ${badge(r.level)}`);
  });

  if (noResult.length > 0) {
    lines.push(`⚪ Sem resultado: ${noResult.map((r) => r.origin).join(', ')}`);
  }

  if (sorted[0]) {
    lines.push('');
    lines.push(`💡 Priorize clientes de *${sorted[0].origin}* — melhor custo de deslocamento.`);
  }

  return _respond(lines.join('\n'), conversationId);
}

// ── 5. CUSTOM — busca específica (comportamento anterior) ────

async function handleCustomSearch({ conversationId, customerPhone, messageContent, history }) {
  const currentParams = extractFlightParams(messageContent);
  const contextParams = extractFlightParams(history.map((m) => m.content).join(' '));

  const HUB_KEYWORDS = ['HUBS', 'PRINCIPAIS', 'TODOS', 'CAPITAIS', 'BRASIL'];
  const isMultiHub = HUB_KEYWORDS.some((kw) => messageContent.toUpperCase().includes(kw));

  const searchParams = {
    origin: currentParams.origin || contextParams.origin,
    destination: currentParams.destination || contextParams.destination,
    departureDate: currentParams.departureDate || contextParams.departureDate,
    returnDate: currentParams.returnDate || null,
  };

  if (isMultiHub && currentParams.origin && !currentParams.destination) {
    searchParams.destination = currentParams.origin;
    searchParams.origin = null;
  }

  if (!searchParams.destination && contextParams.destination) {
    searchParams.destination = contextParams.destination;
  }

  const origins = isMultiHub ? HUBS : [searchParams.origin].filter(Boolean);

  if (origins.length === 0 || !searchParams.destination || !searchParams.departureDate) {
    const missing = [];
    if (origins.length === 0) missing.push('origem (ex: GRU ou "todos os hubs")');
    if (!searchParams.destination) missing.push('destino (ex: FOR)');
    if (!searchParams.departureDate) missing.push('data de ida (ex: 20/04/2026)');

    return _respond(
      '✈️ Para a busca específica, preciso de:\n\n' +
      missing.map((f) => `  • ${f}`).join('\n') +
      '\n\nOu envie *menu* para ver todas as opções.',
    );
  }

  const results = await Promise.all(
    origins.map(async (origin) => {
      try {
        const flightResults = await searchFlights({ ...searchParams, origin });
        const historicalPrices = dbUnavailable ? [] :
          await getRecentSearches({ origin, destination: searchParams.destination }).catch(() => []);
        const opportunity = analyzeSalesOpportunity({
          bestFlight: flightResults.bestFlight,
          cheapestFlight: flightResults.cheapestFlight,
          destination: searchParams.destination,
          historicalPrices,
        });
        return { origin, flightResults, opportunity };
      } catch (err) {
        return { origin, error: err.message };
      }
    }),
  );

  const humanText = buildHumanMessage({
    multiResults: results,
    destination: searchParams.destination,
    departureDate: searchParams.departureDate,
    returnDate: searchParams.returnDate,
  });

  if (!dbUnavailable) {
    try {
      const best = results.find((r) => r.opportunity?.opportunityLevel === 'high') ?? results[0];
      if (best && !best.error) {
        await persistTransaction({
          conversationId,
          customerPhone,
          searchParams: { ...searchParams, origin: best.origin },
          bestFlight: best.flightResults.bestFlight,
          cheapestFlight: best.flightResults.cheapestFlight,
          rawResponse: { resultsCount: results.length },
          salesOpportunity: best.opportunity,
          assistantMessage: humanText,
        });
      }
    } catch (err) {
      console.error('[Agent] Persistence failed:', err.message);
    }
  }

  return formatResponse({
    text: humanText,
    opportunityLevel: results.some((r) => r.opportunity?.opportunityLevel === 'high') ? 'high' : 'medium',
    suggestions: results.flatMap((r) => r.opportunity?.suggestions ?? []).slice(0, 5),
    priceAnalysis: { multiHub: origins.length > 1, totalSearches: results.length },
    searchParams,
  });
}

// ── Date Utilities ───────────────────────────────────────────

function getNextFriday() {
  const today = new Date();
  const day = today.getDay(); // 0=Dom, 5=Sex
  const daysUntil = ((5 - day + 7) % 7) || 7; // se hoje é Sex, vai pro próximo
  return format(addDays(today, daysUntil), 'yyyy-MM-dd');
}

function extractDate(text) {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const brMatch = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (brMatch) {
    const d = parseDateFns(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`, 'yyyy-MM-dd', new Date());
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }

  // "próxima sexta", "semana que vem"
  const lower = text.toLowerCase();
  if (lower.includes('próxima sexta') || lower.includes('proxima sexta')) return getNextFriday();

  return null;
}

function formatDateLabel(iso) {
  const [year, month, day] = iso.split('-');
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return `${DAYS[d.getDay()]} ${day}/${month}`;
}

// ── IATA Utilities ───────────────────────────────────────────

function extractIataCode(text, allowList) {
  const upper = text.toUpperCase();
  return allowList.find((code) => new RegExp(`\\b${code}\\b`).test(upper)) ?? null;
}

function extractFlightParams(text) {
  const upperText = text.toUpperCase();
  let codes = _extractIataCodes(text);

  const paraMatch = upperText.match(/PARA\s+([A-ZÀ-Úa-zà-ú]+)/);
  let paraIata = null;
  if (paraMatch) {
    const city = paraMatch[1];
    if (city === 'FORTALEZA') paraIata = 'FOR';
    if (city === 'BRASILIA' || city === 'BRASÍLIA') paraIata = 'BSB';
    if (city === 'RIO') paraIata = 'GIG';
    if (city === 'PAULO') paraIata = 'GRU';
  }

  if (upperText.includes('FORTALEZA') && !codes.includes('FOR')) codes.push('FOR');
  if ((upperText.includes('SÃO PAULO') || upperText.includes('SAO PAULO')) && !codes.includes('GRU')) codes.push('GRU');
  if (upperText.includes('RIO DE JANEIRO') && !codes.includes('GIG')) codes.push('GIG');

  if (paraIata) {
    codes = codes.filter((c) => c !== paraIata);
    codes.splice(1, 0, paraIata);
  }

  const dates = _extractDates(text);
  const unique = [...new Set(codes)];

  return {
    origin: unique[0] ?? null,
    destination: unique[1] ?? null,
    departureDate: dates[0] ?? null,
    returnDate: dates[1] ?? null,
  };
}

function _extractIataCodes(text) {
  const codes = text.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [];
  const stopWords = new Set([
    'THE', 'AND', 'ARE', 'BUT', 'NOT', 'YOU', 'CAN', 'HAD', 'HER', 'WAS',
    'ONE', 'OUR', 'OUT', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'NOW', 'OLD',
    'SEE', 'WAY', 'WHO', 'DID', 'LET', 'SHE', 'TOO', 'USE', 'DAD', 'MOM',
    'SOU', 'COM', 'QUE', 'POR', 'UMA', 'DOS', 'DAS', 'NOS', 'IDA', 'DIA',
    'VOO', 'VER', 'MEU', 'SEM', 'MAS', 'FAZ', 'TEM', 'VOU', 'SER',
    'TAM', 'GOL', 'AZU', 'LAT',
  ]);
  return codes.filter((c) => !stopWords.has(c));
}

function _extractDates(text) {
  const dates = [];

  const isoMatches = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  for (const m of isoMatches) {
    const d = parseDateFns(m, 'yyyy-MM-dd', new Date());
    if (isValid(d)) dates.push(m);
  }

  const brMatches = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? [];
  for (const m of brMatches) {
    const d = parseDateFns(m, 'dd/MM/yyyy', new Date());
    if (isValid(d)) {
      dates.push(format(d, 'yyyy-MM-dd'));
    }
  }

  return dates;
}

// ── Formatters ───────────────────────────────────────────────

function badge(level) {
  return { high: '🟢 ALTA', medium: '🟡 MÉDIA', low: '🔴 BAIXA', unknown: '⚪' }[level] ?? '⚪';
}

function levelStrategy(level) {
  return {
    high:   ' • Passagem barata = cliente disponível para upgrade. Ofereça suíte premium.',
    medium: ' • Preço médio = acione escassez: "poucos quartos disponíveis neste período".',
    low:    ' • Passagem cara = ofereça crédito resort ou benefícios para amortizar o custo.',
    unknown: ' • Avalie manualmente a oportunidade.',
  }[level] ?? '';
}

function formatCurrency(value) {
  if (!value) return 'N/D';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function _respond(text) {
  return formatResponse({
    text,
    opportunityLevel: 'unknown',
    suggestions: [],
    priceAnalysis: {},
    searchParams: {},
  });
}

// ── DB Helpers ───────────────────────────────────────────────

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
