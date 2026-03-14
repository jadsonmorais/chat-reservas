# 🏨 Chat Reservas — Plataforma de Inteligência Comercial

Chat Reservas é uma plataforma de inteligência comercial para equipes de reservas de resorts de luxo no Ceará. Transforma o **WhatsApp** em um terminal de análise em tempo real: preços de voo, radar competitivo, janelas de captação e ranking de hubs — tudo via menu interativo, com o mínimo de input do usuário.

O diferencial: o agente não apenas busca voos, ele **gera estratégias de venda** baseadas no custo de transporte do hóspede, com insights narrativos via **Claude AI (Anthropic)**.

---

## 🗂️ Três Camadas de Entrega

| Fase | Status | Descrição |
| :--- | :--- | :--- |
| **1 — Chat WhatsApp** | ✅ Ativo | Agente conversacional com menu de 5 fluxos comerciais |
| **2 — BI Metabase** | 🔧 Em desenvolvimento | Dashboards self-service conectados direto ao PostgreSQL |
| **3 — Portal Intranet** | 📋 Planejado | Interface web unificada (Flask) integrando chat + BI |

---

## ✨ Fluxos Disponíveis (menu interativo)

Envie **menu**, **oi** ou **ajuda** para abrir o menu. Responda com o número:

| # | Fluxo | O que faz |
| :--- | :--- | :--- |
| **1** | Mercado hoje | Busca voos de todos os 7 hubs → Fortaleza na próxima sexta |
| **2** | Radar competitivo | Compara Fortaleza vs destinos de luxo concorrentes (Trancoso, Noronha, Búzios…) |
| **3** | Melhor janela | Varre os próximos 14 dias e ranqueia os melhores dias para captação |
| **4** | Ranking de hubs | Qual cidade tem o voo mais barato agora |
| **5** | Busca específica | Origem, destino e data personalizados |

---

## 🏗️ Stack Tecnológica

```
Runtime:     Node.js 22 (Alpine, Docker)
Framework:   Express.js
Banco:       PostgreSQL 15
Cache:       Redis (Alpine)
WhatsApp:    Evolution API v2 (via Baileys)
Voos:        SerpApi — Google Flights engine
IA:          Anthropic SDK — Claude Haiku (insights narrativos)
BI:          Metabase (porta 3001)
Automação:   n8n (opcional)
```

---

## 🚀 Como Começar

### Ambiente de desenvolvimento
```bash
cp .env.example .env
# Preencha SERPAPI_KEY, EVOLUTION_API_*, ANTHROPIC_API_KEY
docker compose up -d --build
```

### Ambiente de treino (com Metabase)
```bash
docker compose -f docker-compose.treino.yml up -d --build
```
Acesse: `http://localhost:3000` (chat) · `http://localhost:3001` (Metabase)

### Ambiente de produção (PostgreSQL externo)
```bash
# 1. Rodar UMA VEZ antes do primeiro deploy:
bash scripts/init-prod-db.sh

# 2. Subir os containers:
docker compose -f docker-compose.producao.yml up -d --build
```

---

## 💼 Estratégias de Venda Automáticas

| Status | Cenário | Estratégia |
| :--- | :--- | :--- |
| 🟢 **ALTA** | Voo barato | Sugerir upgrade de suíte ("economizou no voo, invista no conforto") |
| 🟡 **MÉDIA** | Preço padrão | Gatilho de escassez ("poucos quartos disponíveis neste período") |
| 🔴 **BAIXA** | Voo caro | Oferecer crédito resort para amortizar o custo do aéreo |

---

## 🛠️ Variáveis de Ambiente

| Variável | Uso |
| :--- | :--- |
| `SERPAPI_KEY` | Google Flights via SerpApi |
| `EVOLUTION_API_URL/KEY/INSTANCE_NAME` | Conexão WhatsApp |
| `ANTHROPIC_API_KEY` | Insights narrativos via Claude (opcional — degrada graciosamente) |
| `POSTGRES_USER/PASSWORD/DB/HOST` | Banco de dados |
| `PRICE_THRESHOLD_LOW` | Abaixo → upsell agressivo (ex: `500`) |
| `PRICE_THRESHOLD_MEDIUM` | Acima → estratégia de retenção (ex: `1000`) |
