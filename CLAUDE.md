# CLAUDE.md — Chat Reservas: Agente de Inteligência Comercial

> Este arquivo instrui o Claude Code sobre como se comportar neste projeto.

---

## 🎯 Missão

**Chat Reservas** é uma plataforma de inteligência comercial para equipes de reservas de resorts de luxo no Ceará.

Vai além de um simples chatbot — é um sistema de dados que transforma informações de voo em estratégias de vendas, com três camadas de entrega:

1. **Chat WhatsApp** (Fase 1 — ativo) — Agente conversacional via Evolution API que busca voos e gera oportunidades de upsell em tempo real
2. **BI com Metabase** (Fase 2 — em desenvolvimento) — Dashboards self-service para a equipe analisar tendências, rotas, preços e inteligência competitiva
3. **Portal Intranet Flask** (Fase 3 — planejado) — Interface web unificada que integra o chat e o Metabase

**Princípio central:** Antes de qualquer ação destrutiva ou irreversível, confirme com o usuário.

---

## 🗂️ Stack do Projeto

```
Runtime:        Node.js 22 (Alpine, Docker)
Framework:      Express.js
Banco:          PostgreSQL 15
Cache:          Redis (Alpine)
WhatsApp:       Evolution API v2 (via Baileys)
Voos:           SerpApi — Google Flights engine
BI:             Metabase (porta 3001)
Automação:      n8n (opcional)
IA (Fase 2):    Anthropic SDK — Claude API direto (sem LangChain)
Intranet:       Flask / Python (Fase 3 — planejado)
```

### Por que Anthropic SDK diretamente (sem LangChain)?

O projeto já tem um padrão de `skills` que mapeia 1:1 com o tool use nativo do Claude.
LangChain adicionaria abstração desnecessária, peso e breaking changes frequentes.
O SDK direto entrega: raciocínio sobre linguagem natural, geração de insights narrativos e análise competitiva — tudo que precisamos.

---

## 🗺️ Estrutura de Pastas

```
src/
├── index.js                     # Bootstrap & startup
├── server.js                    # Rotas Express + webhook
├── agent/
│   └── agent.js                 # Motor de raciocínio: menu, 5 intents, Claude integration
├── db/
│   ├── schema.sql               # Schema PostgreSQL
│   ├── init.js                  # Inicialização do banco
│   ├── init-databases.sql       # Auto-cria banco metabase no treino (initdb.d)
│   └── pool.js                  # Pool de conexões (max 10)
├── services/
│   ├── serpApi.js               # Cliente HTTP SerpApi
│   ├── evolutionApi.js          # Cliente Evolution API + formatação
│   └── claudeService.js         # Insights narrativos via Claude Haiku (Anthropic SDK)
└── skills/
    ├── searchFlights.js          # Orquestração de busca de voos
    ├── searchCompetitors.js      # Busca simultânea FOR + 5 destinos concorrentes
    ├── analyzeSalesOpportunity.js # Estratégia de upsell por preço
    ├── persistTransaction.js     # Persistência no banco
    ├── getConversationHistory.js # Memória de curto prazo
    └── getRecentSearches.js      # Buscas recentes
public/
└── index.html                   # Interface web de teste (dark theme)
scripts/
├── init-prod-db.sh              # Roda UMA VEZ antes do deploy em produção
└── setup-metabase.js            # (planejado) Setup automático de dashboards via API
```

---

## 🗄️ Schema do Banco (PostgreSQL)

### `conversations`
| Coluna | Tipo | Obs |
|---|---|---|
| id | TEXT PK | remoteJid da Evolution API |
| customer_phone | TEXT NOT NULL | |
| customer_name | TEXT | |
| created_at / updated_at | TIMESTAMPTZ | |

### `messages`
| Coluna | Tipo | Obs |
|---|---|---|
| id | SERIAL PK | |
| conversation_id | FK → conversations | |
| role | TEXT | 'user' \| 'assistant' \| 'system' |
| content | TEXT | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | índice em (conversation_id, created_at DESC) |

### `flight_searches`
| Coluna | Tipo | Obs |
|---|---|---|
| id | SERIAL PK | |
| conversation_id | FK → conversations | |
| origin / destination | TEXT | Códigos IATA (ex: GRU, FOR) |
| departure_date / return_date | DATE | |
| best_flight / cheapest_flight | JSONB | Dados brutos do voo |
| raw_response | JSONB | Resposta completa SerpApi |
| sales_opportunity | JSONB | Análise de oportunidade |
| created_at | TIMESTAMPTZ | índice em (conversation_id, created_at DESC) |

> **Banco do Metabase:** O Metabase usa um banco separado chamado `metabase` no mesmo PostgreSQL para armazenar dashboards, questões e configurações. Criar antes de subir o container: `CREATE DATABASE metabase;`

---

## ✈️ Inteligência de Voos — Destinos Monitorados

### Destino Principal (nosso resort)
| Destino | IATA | Região |
|---|---|---|
| Fortaleza / Jericoacoara, CE | FOR | Ceará |

### Hubs de Origem (Brasil)
90% do público vem do Brasil. Hubs monitorados: **GRU, BSB, GIG, CNF, VCP, REC, SSA**

### Destinos Competidores (Inteligência Competitiva — Fase 2)
Monitorar preços para os principais resorts de luxo do Brasil permite identificar janelas de oportunidade:

| Destino | IATA | Concorrentes Referência |
|---|---|---|
| Trancoso / Porto Seguro, BA | BPS | Uxua, Etnia, Txai |
| Búzios / Cabo Frio, RJ | CAW | Insolito, Casas Brancas |
| Fernando de Noronha, PE | FEN | Pousadas exclusivas |
| Maragogi / Porto de Galinhas, AL | MCZ | Kenoa, Summerville |
| Angra dos Reis, RJ | RDG | Fasano, Pestana |
| Florianópolis, SC | FLN | Costão do Santinho |
| Foz do Iguaçu, PR | IGU | Belmond |
| Natal / Pipa, RN | NAT | Tivoli Ecoresort |

**Tipo de insight gerado:**
- "Voo para Trancoso nessa semana custa R$ 1.200 — 3x mais caro que para Fortaleza. Momento ideal para prospecção."
- "Semana Santa está cara em todos os destinos premium — nosso diferencial é o custo de deslocamento."
- "Demanda para Fernando de Noronha caiu 40% vs mês passado. Público pode estar aberto a alternativas."

---

## 🔑 Variáveis de Ambiente

Nunca hardcode credenciais. Sempre use `.env` + `dotenv`.

```
# Banco
POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST
DATABASE_URL
TZ=America/Sao_Paulo

# APIs externas
SERPAPI_KEY
EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME

# IA (Fase 2)
ANTHROPIC_API_KEY

# Servidor
PORT

# Regras de negócio
PRICE_THRESHOLD_LOW    # < este valor → upsell agressivo (ex: 300 USD)
PRICE_THRESHOLD_MEDIUM # entre LOW e este → gatilho de escassez (ex: 600 USD)
```

---

## 🔄 Fluxo do Agente (Fase 1 — Ativo)

```
1. Evolution API envia mensagem → POST /webhook/evolution
2. server.js extrai: message, phone, conversationId
3. agent.js persiste mensagem do usuário no DB
4. getConversationHistory() → carrega histórico (para detectar menu ativo)
5. detectIntent() → roteamento por número (1–5) ou keywords
6. Handler do intent executa (busca SerpApi via Promise.all)
7. analyzeSalesOpportunity() → classifica nível de oportunidade
8. claudeService → gera insight narrativo (opcional, requer ANTHROPIC_API_KEY)
9. Resposta do assistente é persistida no DB (base para próximo detectIntent)
10. Resposta formatada → Evolution API envia ao usuário
```

### Intents disponíveis

| Intent | Trigger | Handler |
|---|---|---|
| GREETING | "oi", "menu", "ajuda" ou sem match | Exibe menu com 5 opções |
| MARKET_OVERVIEW | "1" (menu ativo) ou "mercado" | Todos hubs → FOR na próxima sexta |
| COMPETITIVE | "2" (menu ativo) ou "concorrentes" | GRU→FOR vs 5 destinos concorrentes |
| BEST_WINDOW | "3" (menu ativo) ou "janela" | Próximos 14 dias GRU→FOR ranqueados |
| HUB_RANKING | "4" (menu ativo) ou "ranking" | Ranking de preço por hub na próxima sexta |
| CUSTOM | "5" (menu ativo) ou IATA/keywords de voo | Busca com origem/destino/data livres |

> **Importante:** O menu ativo é detectado verificando se o último `assistant` message no histórico contém `1️⃣`. Por isso a resposta do assistente é sempre persistida em `messages` antes de retornar.

### Lógica de Oportunidade de Vendas

| Preço do voo | Nível | Estratégia |
|---|---|---|
| < PRICE_THRESHOLD_LOW | 🟢 HIGH | Sugerir upgrade de suíte ("economizou no voo, invista no conforto") |
| entre LOW e MEDIUM | 🟡 MEDIUM | Gatilho de escassez ("quartos limitados neste período") |
| > PRICE_THRESHOLD_MEDIUM | 🔴 LOW | Oferecer crédito resort para amortizar a passagem |

---

## 📊 Fase 2 — Metabase BI

### O que entregar no Metabase

**Dashboards prioritários:**
1. **Painel de Demanda** — Volume de buscas por rota/período, picos de interesse
2. **Monitor de Preços** — Evolução do preço médio por hub → FOR ao longo do tempo
3. **Radar Competitivo** — Comparativo de preços FOR vs concorrentes por data
4. **Mapa de Oportunidades** — Heatmap de dias com alta oportunidade de upsell (HIGH)
5. **Performance de Conversão** — Buscas vs abordagens realizadas pela equipe

### Conexão Metabase → PostgreSQL

O Metabase conecta diretamente nas tabelas do app. As queries do BI devem ser read-only.
Criar um usuário de leitura dedicado para o Metabase:

```sql
CREATE USER metabase_reader WITH PASSWORD '...';
GRANT CONNECT ON DATABASE chat_reservas TO metabase_reader;
GRANT USAGE ON SCHEMA public TO metabase_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO metabase_reader;
```

---

## 🐳 Ambientes Docker

| Arquivo | Ambiente | Postgres | Metabase |
|---|---|---|---|
| docker-compose.yml | Dev | container interno | não incluído |
| docker-compose.treino.yml | Treino | container interno (porta 5433) | porta 3001 |
| docker-compose.producao.yml | Produção | host.docker.internal | porta 3001 |

**Portas padrão (treino/prod):** `3000` (app), `3001` (metabase), `5432/5433` (postgres), `6379` (redis), `8080/8081` (evolution), `5678` (n8n)

---

## 🌐 Endpoints da API

| Método | Rota | Uso |
|---|---|---|
| GET | /health | Health check |
| POST | /webhook/evolution | Recebe mensagens do WhatsApp |
| POST | /test/message | Teste manual (bypass Evolution API) |
| GET | / | Interface web de chat |

---

## 📐 Convenções de Código

### JavaScript / Node.js
```javascript
// Use async/await, nunca callbacks aninhados
// Variáveis: camelCase | Constantes: UPPER_SNAKE_CASE
// Sempre trate erros com try/catch
// Módulos: CommonJS (require/module.exports)
```

### SQL
```sql
-- Use CTEs para queries complexas
WITH base AS (SELECT ... FROM schema.tabela WHERE ...)
SELECT ... FROM base;

-- Nunca SELECT * em produção — liste as colunas
-- Sempre LIMIT em queries exploratórias
-- Timestamps: sempre TIMESTAMPTZ (não DATE sem timezone)
```

---

## 🔒 Regras de Segurança — NUNCA VIOLAR

```
❌ Nunca hardcode senhas, tokens ou chaves de API
❌ Nunca execute DROP/TRUNCATE/DELETE sem confirmação explícita
❌ Nunca escreva diretamente em produção sem validação prévia
✅ Use transações (BEGIN/COMMIT/ROLLBACK) em operações de escrita
✅ Prefira upsert a insert puro quando houver risco de duplicata
✅ Confirme o ambiente (dev/prod) antes de operações de escrita
✅ O container roda como usuário não-root (appuser, UID 1001)
✅ Metabase acessa o banco via usuário read-only (metabase_reader)
```

---

## 🛠️ Onde modificar para cada tarefa

| Tarefa | Arquivo |
|---|---|
| Nova estratégia de vendas | `src/skills/analyzeSalesOpportunity.js` |
| Parâmetros de busca de voo | `src/skills/searchFlights.js` |
| Adicionar intents / keywords | `src/agent/agent.js` — função `detectIntent` |
| Adicionar destino concorrente | `src/skills/searchCompetitors.js` — array `COMPETITORS` |
| Adicionar hub monitorado | `src/agent/agent.js` — array `HUBS` |
| Ajustar insights de IA | `src/services/claudeService.js` |
| Nova rota de API | `src/server.js` |
| Alterar schema do banco | `src/db/schema.sql` |
| Ajustar thresholds de preço | `.env` — `PRICE_THRESHOLD_LOW/MEDIUM` |
| Comportamento Evolution API | `src/services/evolutionApi.js` |
| Interface web de teste | `public/index.html` |
| Setup banco produção | `scripts/init-prod-db.sh` |

---

## ⚠️ Detalhes de Implementação Importantes

- **Graceful degradation:** App sobe em modo stateless se o PostgreSQL estiver indisponível
- **Pool:** max 10 conexões, idle timeout 30s
- **Retry:** SerpApi retenta até 2x em falha
- **Datas:** normalizadas para UTC internamente; sempre use TIMESTAMPTZ
- **Resposta do agente:** retorna texto humano + metadata estruturado (opportunity level, sugestões, análise de preço)
- **Webhook filter:** ignora mensagens `fromMe: true` e mensagens não-texto
- **Multi-hub:** buscas concorrentes com `Promise.all` — um resultado falho não cancela os demais
- **Persistência do assistente:** toda resposta do agente é salva em `messages` (role=assistant) para que `detectIntent` consiga detectar o menu ativo na próxima mensagem
- **Rebuild obrigatório:** `src/` não está montado como volume — alterações no código exigem `docker compose up -d --build app`, não apenas restart
- **Banco do Metabase (treino):** criado automaticamente via `src/db/init-databases.sql` montado em `initdb.d` do container postgres
- **Banco do Metabase (prod):** criado manualmente com `scripts/init-prod-db.sh` antes do primeiro deploy
