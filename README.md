# 🏨 Chat Reservas — Intelligent Booking Agent

Chat Reservas is an intelligent booking agent designed for luxury hotel reservation teams. It leverages **WhatsApp** for customer communication, **Node.js** as the core agent orchestrator, **PostgreSQL** for short-term and persistent memory, and **SerpApi (Google Flights)** for retrieving real-time flight information. 

By analyzing flight prices against predefined thresholds, it proactively suggests upsells (e.g., "Would you like to book an extra night with the savings?"). 

## ✨ Features

- **WhatsApp Integration:** Built on top of [Evolution API v2](https://evoapicloud.com/) for seamless WhatsApp messaging.
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
Open the `.env` file and fill in your keys, specifically:
- `SERPAPI_KEY`
- `EVOLUTION_API_KEY` (you can choose any secure string for the local Evolution manager)

*(Note: The `DATABASE_URL` and `EVOLUTION_API_URL` internal paths are natively overridden inside `docker-compose.yml` for network mapping, so you don't need to change them in your `.env` for local Docker runs).*

### 2. Run the Stack
Start everything using Docker Compose. The `app` will be built automatically from the root `Dockerfile`:
```bash
docker-compose up -d --build
```
This stands up Postgres, Redis, Evolution API, n8n, and your Node.js application all at once.

### 3. Connect WhatsApp
1. Navigate to your Evolution API Manager UI or hit the `/instance/create` endpoint locally (Port `8080`).
2. Create an instance with the type `WHATSAPP-BAILEYS`.
3. Read the generated QR code with your WhatsApp app on your phone.
4. Configure the instance's webhook to point to `http://chat_reservas_app:3000/webhook/evolution`, subscribing to the `messages.upsert` event.

*(If you ever face an issue where the QR Code refuses to display, ensure that your `CONFIG_SESSION_PHONE_VERSION` in `docker-compose` matches a recent WhatsApp Web rollout).*

## 🧪 Testing Locally

If you prefer to test the agent logic without sending messages through a paired WhatsApp number, you can simulate a conversation directly through the Node.js API test endpoint:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"conversationId":"test-123","message":"Olá, preciso buscar um voo saindo de GRU para MIA dia 15/04/2026", "customerPhone":"+5511999999999"}' \
  http://localhost:3000/test/message
```

The app is mapped locally on port `3000`. You can also check its health at `http://localhost:3000/health`.
