# Chat Reservas — Inteligência Comercial de Voos

Módulo da plataforma de dados **Carmel Hotéis**. Transforma o WhatsApp em um terminal de análise de malha aérea em tempo real: preços de voo, radar competitivo, janelas de captação e ranking de hubs — com estratégias de venda geradas automaticamente para a equipe de reservas.

---

## Posição na Plataforma Carmel

```
Plataforma Carmel (dados operacionais)
│
├── ETL Pipeline             ← Infraspeak, PDV, NF-e, Fiscal → PostgreSQL (schema carmel)
├── Flask Intranet           ← Portal web, autenticação, relatórios
└── chat-reservas  ◄ você está aqui
    ├── Fase 1 — Chat WhatsApp    ✅ ativo
    └── Fase 2 — Blueprint Flask  📋 planejado (importado pela intranet)
```

O chat-reservas usa seu **próprio banco PostgreSQL** (`chat_reservas`) com schema isolado. Na Fase 2, será empacotado como um Blueprint Flask e incorporado à intranet Carmel, com acesso direto ao banco `carmel` para cruzar dados de reservas com dados operacionais.

---

## Stack

```
Runtime:    Python 3.12 (Alpine, Docker)
Framework:  Flask 3 + Gunicorn
Banco:      PostgreSQL 15 (schema próprio: conversations, messages, flight_searches)
Cache:      Redis (exclusivo para o Evolution API — sessões WhatsApp)
WhatsApp:   Evolution API v2 (via Baileys)
Voos:       SerpApi MCP server (google_flights engine)
IA:         Google Gemini 2.0 Flash (insights narrativos — opcional)
Automação:  n8n (opcional)
```

---

## Fluxos do Agente

Envie **oi**, **menu** ou **ajuda** para abrir o menu. Responda com o número:

| # | Fluxo | Descrição |
|---|---|---|
| 1 | Mercado hoje | Voos de todos os 7 hubs → Fortaleza na próxima sexta, ranqueados por preço |
| 2 | Radar competitivo | Fortaleza vs 5 destinos de luxo concorrentes (Trancoso, Noronha, Búzios…) |
| 3 | Melhor janela | Próximos 14 dias ranqueados — identifica os dias ideais de captação |
| 4 | Ranking de hubs | Qual hub tem o voo mais barato agora para Fortaleza |
| 5 | Busca específica | Origem, destino e data livres |

---

## Estratégias de Venda

O agente classifica cada resultado e sugere uma abordagem comercial:

| Nível | Condição | Estratégia |
|---|---|---|
| 🟢 ALTA | Voo barato (`< PRICE_THRESHOLD_LOW`) | Sugerir upgrade de suíte |
| 🟡 MÉDIA | Preço intermediário | Gatilho de escassez |
| 🔴 BAIXA | Voo caro (`> PRICE_THRESHOLD_MEDIUM`) | Oferecer crédito resort |

Com `GEMINI_API_KEY` configurado, cada resposta ganha um parágrafo de análise narrativa gerado pelo Gemini 2.0 Flash.

---

## Banco de Dados

Schema próprio no PostgreSQL. Tabelas:

| Tabela | Descrição |
|---|---|
| `conversations` | Uma linha por número de WhatsApp |
| `messages` | Histórico de mensagens (role: user / assistant) |
| `flight_searches` | Resultado de cada busca com oportunidade de venda (JSONB) |

---

## Ambientes

| Arquivo | Uso | Postgres |
|---|---|---|
| `docker-compose.yml` | Dev rápido | container interno porta 5432 |
| `docker-compose.treino.yml` | Treino local | container interno porta 5433 |
| `docker-compose.producao.yml` | Produção | host externo via `POSTGRES_HOST` |

---

## Subir o ambiente de treino

```bash
cp .env.example .env
# Preencher: SERPAPI_KEY, EVOLUTION_API_*, GEMINI_API_KEY (opcional)

docker compose -f docker-compose.treino.yml up -d --build
```

Acesse: `http://localhost:3000`

### Primeiro deploy em produção

```bash
# Cria banco e schema no PostgreSQL externo (rodar UMA VEZ):
bash scripts/init-prod-db.sh

docker compose -f docker-compose.producao.yml up -d --build
```

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SERPAPI_KEY` | ✅ | Chave SerpApi (Google Flights) |
| `EVOLUTION_API_URL` | ✅ | URL do Evolution API |
| `EVOLUTION_API_KEY` | ✅ | Chave de autenticação |
| `EVOLUTION_INSTANCE_NAME` | ✅ | Nome da instância WhatsApp |
| `DATABASE_URL` | ✅ | Connection string PostgreSQL |
| `POSTGRES_USER/PASSWORD/DB` | ✅ | Credenciais do banco |
| `GEMINI_API_KEY` | — | Insights narrativos via Gemini (opcional) |
| `PRICE_THRESHOLD_LOW` | — | Limiar de oportunidade alta (default: 300) |
| `PRICE_THRESHOLD_MEDIUM` | — | Limiar de oportunidade média (default: 600) |
| `USE_MCP` | — | `true` usa SerpApi MCP, `false` usa HTTP direto (default: true) |
| `TZ` | — | Timezone (ex: `America/Sao_Paulo`) |

---

## Estrutura

```
app/
├── __init__.py                    # create_app() factory (padrão intranet Carmel)
├── agent/
│   ├── agent.py                   # detect_intent() + 5 handlers comerciais
│   └── webhook.py                 # Blueprint Flask: /webhook/evolution, /test/message, /health
├── db/
│   ├── pool.py                    # ThreadedConnectionPool (psycopg2)
│   ├── init.py                    # Executa schema.sql na inicialização
│   └── schema.sql                 # DDL: conversations, messages, flight_searches
├── services/
│   ├── serpapi_mcp.py             # Cliente MCP (https://mcp.serpapi.com)
│   ├── serpapi_http.py            # Fallback HTTP direto (USE_MCP=false)
│   ├── evolution_api.py           # send_message() + formatação WhatsApp
│   └── gemini_service.py          # Insights narrativos via Gemini 2.0 Flash
└── skills/
    ├── search_flights.py           # Busca com retry (2x backoff)
    ├── search_competitors.py       # ThreadPoolExecutor: FOR + 5 concorrentes
    ├── analyze_sales_opportunity.py
    ├── persist_transaction.py      # ACID via psycopg2
    ├── get_conversation_history.py
    └── get_recent_searches.py
config.py                          # Config class (padrão intranet Carmel)
run.py                             # Entry point
```
