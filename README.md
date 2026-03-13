# 🏨 Chat Reservas — Intelligent Booking Agent

Chat Reservas is an intelligent booking agent designed for luxury hotel reservation teams. It leverages **WhatsApp** for customer communication, **Node.js** as the core agent orchestrator, **PostgreSQL** for short-term and persistent memory, and **SerpApi (Google Flights)** for retrieving real-time flight information. 

By analyzing flight prices against predefined thresholds, it proactively suggests upsells (e.g., "Would you like to book an extra night with the savings?"). 

## ✨ Features

- **WhatsApp Integration:** Built on top of [Evolution API v2](https://evoapicloud.com/) for seamless WhatsApp messaging.
- **Web Test interface:** Built-in chat UI for rapid testing without needing a phone.
- **Flight Data:** Uses SerpApi to perform real-time searches on Google Flights to find the best and cheapest flights.
- **Intelligent Routing & Memory:** The Node.js agent interprets intent and remembers conversation context, acting as a smart proxy between APIs.
- **Sales Opportunities Detection:** Evaluates flight prices (e.g., flight was cheaper than expected) to identify clear upsell opportunities for the reservation team.
- **Containerized Architecture:** Fully powered by Docker Compose, making it extremely straightforward to deploy everywhere.

## 🏗️ Architecture Stack

The platform is orchestrated entirely via `docker-compose.yml` and consists of:
1. **Node.js Agent (App):** Express server answering webhooks, running the intelligent logic.
2. **PostgreSQL 15:** Relational database ensuring conversation histories, transactions, and system memory are stored safely.
3. **Redis:** Caching and message broker system used internally by Evolution API.
4. **Evolution API v2:** An omnichannel API gateway connecting directly to WhatsApp instances via QR Code pairing.
5. **n8n:** Local automation server prepared for workflow extensions.

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose installed on your machine.
- An API Key from [SerpApi](https://serpapi.com/).

### 1. Environment Setup
Clone the repository and prepare your environment variables:
```bash
cp .env.example .env
```
Open the `.env` file and fill in your keys.

### 2. Run the Stack
```bash
docker-compose up -d --build
```

## 🧪 Testing with Web Interface

Access the simplified chat interface (perfect for quick tests without WhatsApp):
👉 **[http://localhost:3000](http://localhost:3000)**

### 💡 Example Prompts (What to type)

- **Standard Search:** `"Voo de GRU para FOR no dia 20/05/2026"`
- **Round-trip (Context):** `"Preciso ir de São Paulo para Miami dia 15/04/2026 e voltar dia 22/04/2026"`
- **Vague Request (Memory Test):** `"Quero viajar para Paris saindo de GRU"` (The bot will ask for the missing date).
- **Price Sensitivity:** `"Busque o voo mais barato de GIG para FOR amanhã"`

## 💼 Business Use Cases

### 1. Upsell Optimization
When the agent detects an **Opportunity: High** (Price below threshold), it suggests:
- Proposing a room upgrade since the flight was cheaper than expected.
- Offering a "Flight + Resort" package with a better margin.

### 2. Recovery Strategy
When the agent detects an **Opportunity: Low** (Price above threshold), it suggests:
- Highlighting date flexibility to the client.
- Offering a resort credit (e.g., $50 SPA voucher) to offset the expensive airfare and secure the hotel booking.

### 3. Lead Qualification
The system automatically logs every search in **PostgreSQL**, allowing the sales team to:
- See what destinations are most searched.
- Follow up with users who looked for flights but haven't booked the hotel yet.

---

## 🛠️ Configuration

You can adjust the "Opportunity" triggers in the `.env` or code:
- `PRICE_THRESHOLD_LOW`: Below this price, the opportunity is **HIGH** (🟢).
- `PRICE_THRESHOLD_MEDIUM`: Above this but below a second threshold, it's **MEDIUM** (🟡).
- Default: Flights above 600 BRL are considered **LOW** opportunity (🔴) in terms of price-based upsell.
