# 🏨 Chat Reservas — Agente de Reservas Inteligente

O Chat Reservas é um agente de elite para equipes de reservas de hotéis de luxo. Ele transforma o **WhatsApp** em um terminal de inteligência comercial, utilizando **Node.js**, **PostgreSQL** e **SerpApi (Google Flights)** para monitorar malhas aéreas e criar oportunidades de venda em tempo real.

O grande diferencial: o agente não apenas busca voos, ele **analisa criticamente** os dados para sugerir upgrades, pacotes de cortesia ou estratégias de retenção baseadas no custo de transporte do hóspede.

## ✨ Super-Poderes do Agente

- **🚀 Análise Técnica de Malha Aérea:** Capaz de monitorar os 7 principais hubs do Brasil (**GRU, BSB, GIG, CNF, VCP, REC, SSA**) simultaneamente para encontrar a melhor porta de entrada para o seu resort.
- **🧠 Prioridade de Contexto Inteligente:** O agente entende mudanças de plano. Se você alterar a data ou o destino na última mensagem, ele descarta o contexto antigo e foca no novo.
- **🗺️ Mapeamento Semântico de Cidades:** Entende "Fortaleza", "Ceará", "São Paulo" e outros, mapeando automaticamente para os códigos aeroportuários (IATA) corretos.
- **🏢 Dashboards de Oportunidade:** Gera um relatório visual com badges de status (🟢 Alta, 🟡 Média, 🔴 Baixa) e estratégias de conversão personalizadas.
- **📱 Interface de Teste Web Própria:** Chat interativo em tempo real para simulações e ajustes sem necessidade de celular.

## 🏗️ Stack Tecnológica

O ecossistema é orquestrado via Docker e inclui:
1. **Agente Inteligente (Node.js):** O cérebro que processa linguagem natural e orquestra as APIs.
2. **Evolution API v2:** Conexão robusta e estável com WhatsApp via Baileys.
3. **PostgreSQL 15:** Memória persistente de buscas, transações e histórico de leads.
4. **Redis:** Alta performance para cache e mensageria.
5. **n8n:** Pronto para automações avançadas de fluxo de trabalho.

## 🚀 Como Começar (3 Minutos)

### 1. Preparar o Ambiente
```bash
cp .env.example .env
```
Adicione sua `SERPAPI_KEY` e defina sua `EVOLUTION_API_KEY`.

### 2. Lançar no Docker
```bash
docker-compose up -d --build
```

### 3. Acessar a Interface
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 💡 Como Usar: Exemplos de Impacto

O agente responde a comandos naturais de alto nível:

### ⚡ Consulta de Hubs (Ideal para o Reservas)
> *"Quero ver oportunidades de todos os principais hubs para Fortaleza no dia 15/05/2026"*

**Resultado:** O bot fará uma varredura em todo o Brasil, trará o resumo de preços de cada aeroporto principal e destacará a **Melhor Oportunidade Global** para o seu time focar a venda.

### 🔄 Ajuste Rápido (Prioridade de Mensagem)
> *"Mude para o dia 20/05"*

**Resultado:** O sistema automaticamente mantém o destino e origem anteriores, mas atualiza rigidamente a data para o novo pedido, limpando contextos irrelevantes (como uma data de volta antiga).

### 🏖️ Busca por Nome de Cidade
> *"Voo de São Paulo para Fortaleza amanhã"*

**Resultado:** Mapeamento instantâneo (GRU → FOR) e análise de oportunidade imediata.

---

## 💼 Estratégias de Venda Automáticas

O Agente gera 'Insights de Conversão' baseados no preço encontrado:

| Status | Cenário | Estratégia do Bot |
| :--- | :--- | :--- |
| **🟢 ALTA** | Voo mais barato que a média | Sugerir upgrade para Suíte Master ("Economize no voo, invista no conforto"). |
| **🟡 MÉDIA** | Preço padrão de mercado | Usar gatilho de escassez no hotel ("Vagas limitadas para este período"). |
| **🔴 BAIXA** | Voo caro ou com escalas | Oferecer crédito de resort (R$ 300) para amortizar o custo do aéreo e garantir o hotel. |

---

## 🛠️ Configuração de Gatilhos (.env)

Ajuste o comportamento do "cérebro" comercial:
- `PRICE_THRESHOLD_LOW=500`: Abaixo disso, o bot entra em modo "Agressivo de Upsell".
- `PRICE_THRESHOLD_MEDIUM=1000`: Acima disso, o bot foca em estratégias de "Retenção de Cliente".
