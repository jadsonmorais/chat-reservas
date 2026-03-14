/**
 * Setup automático dos dashboards do Chat Reservas no Metabase.
 * Uso: node scripts/setup-metabase.js
 */

const METABASE_URL = process.env.METABASE_URL || 'http://localhost:3001';
const EMAIL       = 'jadsonlsmorais@gmail.com';
const PASSWORD    = 'Jlsm5!eo16@#';
const DATABASE_ID = 2; // Chat Reservas

// ── Helpers ─────────────────────────────────────────────────

async function api(method, path, body, token) {
  const res = await fetch(`${METABASE_URL}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Metabase-Session': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`[${method} ${path}] ${JSON.stringify(json)}`);
  return json;
}

async function login() {
  const { id } = await api('POST', '/session', { username: EMAIL, password: PASSWORD });
  console.log('✅ Autenticado no Metabase');
  return id;
}

async function createCard(token, name, sql, description = '') {
  const card = await api('POST', '/card', {
    name,
    description,
    display: 'table',
    dataset_query: {
      type: 'native',
      native: { query: sql },
      database: DATABASE_ID,
    },
    visualization_settings: {},
    collection_id: null,
  }, token);
  console.log(`  📊 Card criado: "${name}" (id: ${card.id})`);
  return card.id;
}

async function createDashboard(token, name, description = '') {
  const dash = await api('POST', '/dashboard', { name, description }, token);
  console.log(`\n📋 Dashboard criado: "${name}" (id: ${dash.id})`);
  return dash.id;
}

async function setDashboardCards(token, dashboardId, cards) {
  const payload = cards.map(({ cardId, col, row, sizeX = 12, sizeY = 8 }, i) => ({
    id: -(i + 1),
    card_id: cardId,
    col,
    row,
    size_x: sizeX,
    size_y: sizeY,
    parameter_mappings: [],
    visualization_settings: {},
  }));
  await api('PUT', `/dashboard/${dashboardId}/cards`, { cards: payload }, token);
  console.log(`  ✅ ${cards.length} card(s) adicionados ao dashboard ${dashboardId}`);
}

// ── Queries ─────────────────────────────────────────────────

const QUERIES = {

  // ── 1. PAINEL DE DEMANDA ──────────────────────────────────

  buscasPorDia: `
SELECT
  DATE(created_at AT TIME ZONE 'America/Sao_Paulo') AS data,
  COUNT(*) AS buscas
FROM flight_searches
GROUP BY data
ORDER BY data DESC
LIMIT 60;`,

  buscasPorRota: `
SELECT
  origin || ' → ' || destination AS rota,
  COUNT(*) AS total_buscas
FROM flight_searches
GROUP BY rota
ORDER BY total_buscas DESC
LIMIT 15;`,

  buscasPorHub: `
SELECT
  origin AS hub_origem,
  COUNT(*) AS total_buscas
FROM flight_searches
GROUP BY hub_origem
ORDER BY total_buscas DESC;`,

  // ── 2. MONITOR DE PREÇOS ──────────────────────────────────

  precoMedioPorRota: `
SELECT
  origin || ' → ' || destination AS rota,
  ROUND(AVG((cheapest_flight->>'price')::numeric), 2)  AS preco_minimo_medio_usd,
  ROUND(AVG((best_flight->>'price')::numeric), 2)      AS preco_melhor_medio_usd,
  COUNT(*) AS amostras
FROM flight_searches
WHERE cheapest_flight IS NOT NULL
GROUP BY rota
ORDER BY preco_minimo_medio_usd ASC;`,

  evolucaoPrecoGRU: `
SELECT
  DATE(created_at AT TIME ZONE 'America/Sao_Paulo') AS data,
  ROUND(AVG((cheapest_flight->>'price')::numeric), 2) AS preco_medio_usd
FROM flight_searches
WHERE origin = 'GRU' AND destination = 'FOR'
  AND cheapest_flight IS NOT NULL
GROUP BY data
ORDER BY data DESC
LIMIT 30;`,

  rankingPrecosPorData: `
SELECT
  departure_date,
  origin,
  destination,
  (cheapest_flight->>'price')::numeric AS preco_usd,
  (cheapest_flight->>'airline') AS companhia
FROM flight_searches
WHERE cheapest_flight IS NOT NULL
ORDER BY departure_date ASC, preco_usd ASC
LIMIT 50;`,

  // ── 3. RADAR COMPETITIVO ──────────────────────────────────

  competitivoForVsOutros: `
SELECT
  destination AS destino,
  ROUND(AVG((cheapest_flight->>'price')::numeric), 2) AS preco_medio_usd,
  COUNT(*) AS buscas
FROM flight_searches
WHERE cheapest_flight IS NOT NULL
GROUP BY destination
ORDER BY preco_medio_usd ASC;`,

  destinosMaisCustososPorHub: `
SELECT
  origin AS hub,
  destination AS destino,
  ROUND(AVG((cheapest_flight->>'price')::numeric), 2) AS preco_medio_usd
FROM flight_searches
WHERE cheapest_flight IS NOT NULL
GROUP BY hub, destino
ORDER BY hub, preco_medio_usd DESC;`,

  janelasBaratas: `
SELECT
  departure_date,
  origin,
  (cheapest_flight->>'price')::numeric AS preco_usd,
  sales_opportunity->>'opportunityLevel' AS oportunidade
FROM flight_searches
WHERE
  destination = 'FOR'
  AND cheapest_flight IS NOT NULL
  AND (cheapest_flight->>'price')::numeric < 300
ORDER BY departure_date ASC
LIMIT 30;`,

  // ── 4. MAPA DE OPORTUNIDADES ──────────────────────────────

  oportunidadesPorNivel: `
SELECT
  COALESCE(sales_opportunity->>'opportunityLevel', 'desconhecido') AS nivel,
  COUNT(*) AS total,
  ROUND(AVG((cheapest_flight->>'price')::numeric), 2) AS preco_medio_usd
FROM flight_searches
GROUP BY nivel
ORDER BY total DESC;`,

  heatmapOportunidades: `
SELECT
  DATE(created_at AT TIME ZONE 'America/Sao_Paulo') AS data,
  origin AS hub,
  sales_opportunity->>'opportunityLevel' AS nivel,
  COUNT(*) AS ocorrencias
FROM flight_searches
WHERE sales_opportunity IS NOT NULL
GROUP BY data, hub, nivel
ORDER BY data DESC, ocorrencias DESC
LIMIT 100;`,

  sugestoesFrequentes: `
SELECT
  sugestao,
  COUNT(*) AS frequencia
FROM flight_searches,
  jsonb_array_elements_text(
    CASE jsonb_typeof(sales_opportunity->'suggestions')
      WHEN 'array' THEN sales_opportunity->'suggestions'
      ELSE '[]'::jsonb
    END
  ) AS sugestao
GROUP BY sugestao
ORDER BY frequencia DESC
LIMIT 20;`,

  // ── 5. PERFORMANCE DE CONVERSÃO ───────────────────────────

  conversoesPorDia: `
SELECT
  DATE(m.created_at AT TIME ZONE 'America/Sao_Paulo') AS data,
  COUNT(DISTINCT m.conversation_id) AS conversas_ativas,
  COUNT(*) FILTER (WHERE m.role = 'user') AS mensagens_usuario,
  COUNT(*) FILTER (WHERE m.role = 'assistant') AS respostas_agente
FROM messages m
GROUP BY data
ORDER BY data DESC
LIMIT 30;`,

  buscasPorConversa: `
SELECT
  c.customer_phone,
  c.customer_name,
  COUNT(fs.id) AS total_buscas,
  MIN(fs.created_at AT TIME ZONE 'America/Sao_Paulo') AS primeira_busca,
  MAX(fs.created_at AT TIME ZONE 'America/Sao_Paulo') AS ultima_busca
FROM conversations c
LEFT JOIN flight_searches fs ON fs.conversation_id = c.id
GROUP BY c.id, c.customer_phone, c.customer_name
ORDER BY total_buscas DESC
LIMIT 30;`,

  resumoGeral: `
SELECT
  COUNT(DISTINCT c.id)  AS total_conversas,
  COUNT(DISTINCT m.id)  AS total_mensagens,
  COUNT(DISTINCT fs.id) AS total_buscas_voo,
  COUNT(DISTINCT fs.id) FILTER (
    WHERE fs.sales_opportunity->>'opportunityLevel' = 'high'
  ) AS oportunidades_high
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
LEFT JOIN flight_searches fs ON fs.conversation_id = c.id;`,
};

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Iniciando setup dos dashboards do Chat Reservas...\n');
  const token = await login();

  // ── Dashboard 1: Painel de Demanda ───────────────────────
  const d1 = await createDashboard(token,
    '📈 Painel de Demanda',
    'Volume de buscas por rota, período e hub de origem'
  );
  const c1a = await createCard(token, 'Buscas por Dia',            QUERIES.buscasPorDia,  'Evolução diária do volume de buscas');
  const c1b = await createCard(token, 'Top Rotas Buscadas',        QUERIES.buscasPorRota, 'Rotas com maior volume de pesquisa');
  const c1c = await createCard(token, 'Buscas por Hub de Origem',  QUERIES.buscasPorHub,  'Distribuição de origem por aeroporto');
  await setDashboardCards(token, d1, [
    { cardId: c1a, col: 0,  row: 0, sizeX: 18, sizeY: 8 },
    { cardId: c1b, col: 0,  row: 8, sizeX: 12, sizeY: 8 },
    { cardId: c1c, col: 12, row: 8, sizeX: 6,  sizeY: 8 },
  ]);

  // ── Dashboard 2: Monitor de Preços ───────────────────────
  const d2 = await createDashboard(token,
    '💰 Monitor de Preços',
    'Evolução e comparativo de preços de voo por rota'
  );
  const c2a = await createCard(token, 'Preço Médio por Rota',        QUERIES.precoMedioPorRota,    'Custo mínimo e melhor voo por rota');
  const c2b = await createCard(token, 'Evolução GRU → FOR',          QUERIES.evolucaoPrecoGRU,     'Histórico de preço mínimo GRU para Fortaleza');
  const c2c = await createCard(token, 'Ranking de Preços por Data',  QUERIES.rankingPrecosPorData, 'Melhores preços por data de embarque');
  await setDashboardCards(token, d2, [
    { cardId: c2a, col: 0,  row: 0, sizeX: 18, sizeY: 8 },
    { cardId: c2b, col: 0,  row: 8, sizeX: 12, sizeY: 8 },
    { cardId: c2c, col: 12, row: 8, sizeX: 6,  sizeY: 8 },
  ]);

  // ── Dashboard 3: Radar Competitivo ───────────────────────
  const d3 = await createDashboard(token,
    '🎯 Radar Competitivo',
    'Comparativo de preço Fortaleza vs destinos concorrentes de luxo'
  );
  const c3a = await createCard(token, 'FOR vs Concorrentes — Preço Médio',  QUERIES.competitivoForVsOutros,     'Comparativo de custo de voo por destino');
  const c3b = await createCard(token, 'Destinos mais Caros por Hub',        QUERIES.destinosMaisCustososPorHub, 'Quais destinos custam mais saindo de cada hub');
  const c3c = await createCard(token, 'Janelas Baratas para FOR',           QUERIES.janelasBaratas,             'Datas com passagem para Fortaleza abaixo de USD 300');
  await setDashboardCards(token, d3, [
    { cardId: c3a, col: 0,  row: 0, sizeX: 18, sizeY: 8 },
    { cardId: c3b, col: 0,  row: 8, sizeX: 12, sizeY: 8 },
    { cardId: c3c, col: 12, row: 8, sizeX: 6,  sizeY: 8 },
  ]);

  // ── Dashboard 4: Mapa de Oportunidades ──────────────────
  const d4 = await createDashboard(token,
    '🗺️ Mapa de Oportunidades',
    'Distribuição e frequência das oportunidades de upsell detectadas'
  );
  const c4a = await createCard(token, 'Oportunidades por Nível',   QUERIES.oportunidadesPorNivel, 'Contagem de HIGH / MEDIUM / LOW');
  const c4b = await createCard(token, 'Heatmap de Oportunidades',  QUERIES.heatmapOportunidades,  'Oportunidades por dia e hub');
  const c4c = await createCard(token, 'Sugestões Mais Frequentes', QUERIES.sugestoesFrequentes,   'Argumentos de venda mais gerados pelo agente');
  await setDashboardCards(token, d4, [
    { cardId: c4a, col: 0, row: 0, sizeX: 6,  sizeY: 8 },
    { cardId: c4b, col: 6, row: 0, sizeX: 12, sizeY: 8 },
    { cardId: c4c, col: 0, row: 8, sizeX: 18, sizeY: 8 },
  ]);

  // ── Dashboard 5: Performance de Conversão ───────────────
  const d5 = await createDashboard(token,
    '📞 Performance de Conversão',
    'Atividade de conversas, mensagens e engajamento por cliente'
  );
  const c5a = await createCard(token, 'Resumo Geral',             QUERIES.resumoGeral,        'Totais de conversas, mensagens e oportunidades');
  const c5b = await createCard(token, 'Atividade Diária do Chat', QUERIES.conversoesPorDia,   'Mensagens de usuário e respostas do agente por dia');
  const c5c = await createCard(token, 'Buscas por Cliente',       QUERIES.buscasPorConversa,  'Clientes com mais buscas realizadas');
  await setDashboardCards(token, d5, [
    { cardId: c5a, col: 0,  row: 0, sizeX: 18, sizeY: 4 },
    { cardId: c5b, col: 0,  row: 4, sizeX: 12, sizeY: 8 },
    { cardId: c5c, col: 12, row: 4, sizeX: 6,  sizeY: 8 },
  ]);

  console.log('\n✅ Setup concluído! Acesse: http://localhost:3001/dashboard\n');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
