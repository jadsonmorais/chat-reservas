/**
 * claudeService.js
 * Geração de insights narrativos via Claude API (Anthropic SDK).
 * Gracefully desativa se ANTHROPIC_API_KEY não estiver configurada.
 */

import Anthropic from '@anthropic-ai/sdk';

let _client = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM_PROMPT =
  'Você é um analista comercial sênior de um resort de luxo no Ceará. ' +
  'Sua função é transformar dados de voo em insights acionáveis para a equipe de reservas. ' +
  'Seja direto, prático e foque em oportunidades de abordagem comercial. ' +
  'Máximo 3 linhas. Sem bullet points. Tom profissional.';

/**
 * Gera insight narrativo para visão geral do mercado (todos hubs → FOR).
 * @param {{ results: Array, destination: string, date: string }} data
 */
export async function insightMarketOverview({ results, destination, date }) {
  const c = getClient();
  if (!c) return null;

  const priceList = results
    .filter((r) => !r.error && r.price)
    .sort((a, b) => a.price - b.price)
    .map((r) => `${r.origin}: R$${r.price} (${r.level})`)
    .join(' | ');

  if (!priceList) return null;

  return _callClaude(c,
    `Dados de voo para ${destination} em ${date}: ${priceList}. ` +
    `Qual o nível de oportunidade geral? Qual hub priorizar? Que abordagem usar com o cliente?`,
  );
}

/**
 * Gera insight para análise competitiva (FOR vs concorrentes).
 * @param {{ forResult: object, competitors: Array, origin: string, date: string }} data
 */
export async function insightCompetitive({ forResult, competitors, origin, date }) {
  const c = getClient();
  if (!c) return null;

  const forPrice = forResult?.price ?? 'N/D';
  const compList = competitors
    .filter((cp) => !cp.error && cp.price)
    .map((cp) => `${cp.name}: R$${cp.price}`)
    .join(' | ');

  if (!compList) return null;

  return _callClaude(c,
    `Preço ${origin}→Fortaleza em ${date}: R$${forPrice}. ` +
    `Destinos concorrentes: ${compList}. ` +
    `Fortaleza está competitiva? Há janela de captação vs esses destinos?`,
  );
}

/**
 * Gera insight para melhor janela de captação.
 * @param {{ windows: Array, origin: string }} data
 */
export async function insightBestWindow({ windows, origin }) {
  const c = getClient();
  if (!c) return null;

  const top = windows
    .slice(0, 6)
    .map((w) => `${w.dateLabel}: R$${w.price}`)
    .join(' | ');

  if (!top) return null;

  return _callClaude(c,
    `Preços ${origin}→Fortaleza nas próximas 2 semanas: ${top}. ` +
    `Qual período priorizar para captação ativa? Por quê?`,
  );
}

// ── Internal helper ──────────────────────────────────────────

async function _callClaude(client, userMessage) {
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    return res.content[0]?.text?.trim() ?? null;
  } catch (err) {
    console.warn('[Claude] Insight generation failed:', err.message);
    return null;
  }
}
