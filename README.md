# 🏨 Chat Reservas — Agente de Reservas Inteligente

O Chat Reservas é um agente de reservas inteligente desenvolvido para equipes de reservas de hotéis de luxo. Ele utiliza o **WhatsApp** para comunicação com o cliente, **Node.js** como orquestrador central, **PostgreSQL** para memória de curto e longo prazo, e a **SerpApi (Google Flights)** para obter informações de voos em tempo real.

Ao analisar os preços dos voos em relação a limites predefinidos, o agente sugere proativamente estratégias de upsell (ex: "Gostaria de reservar uma noite extra com a economia feita na passagem?").

## ✨ Funcionalidades

- **Integração com WhatsApp:** Construído sobre a [Evolution API v2](https://evoapicloud.com/) para mensagens fluidas via WhatsApp.
- **Interface de Teste Web:** Interface de chat integrada para testes rápidos sem necessidade de celular.
- **Dados de Voos:** Utiliza SerpApi para buscas em tempo real no Google Flights, encontrando as melhores e mais baratas opções.
- **Roteamento Inteligente e Memória:** O agente interpreta intenções e lembra do contexto da conversa, atuando como um proxy inteligente entre APIs.
- **Detecção de Oportunidades de Venda:** Avalia o preço dos voos para identificar oportunidades claras de upsell para a equipe de reservas.
- **Arquitetura em Containers:** Totalmente baseado em Docker Compose, facilitando a implantação em qualquer ambiente.

## 🏗️ Stack de Arquitetura

A plataforma é orquestrada inteiramente via `docker-compose.yml` e consiste em:
1. **Agente Node.js (App):** Servidor Express que processa webhooks e executa a lógica inteligente.
2. **PostgreSQL 15:** Banco de dados relacional para histórias de conversa, transações e memória do sistema.
3. **Redis:** Sistema de cache e mensageria usado internamente pela Evolution API.
4. **Evolution API v2:** Gateway de API que conecta diretamente a instâncias do WhatsApp via pareamento de QR Code.
5. **n8n:** Servidor de automação local preparado para extensões de fluxo de trabalho.

## 🚀 Como Começar

### Pré-requisitos
- Docker e Docker Compose instalados.
- Uma chave de API da [SerpApi](https://serpapi.com/).

### 1. Configuração do Ambiente
Clone o repositório e prepare suas variáveis de ambiente:
```bash
cp .env.example .env
```
Abra o arquivo `.env` e preencha suas chaves.

### 2. Rodar a Aplicação
```bash
docker-compose up -d --build
```

## 🧪 Testando com a Interface Web

Acesse a interface de chat simplificada (perfeita para testes rápidos):
👉 **[http://localhost:3000](http://localhost:3000)**

### 💡 Exemplos de Prompts (O que digitar)

- **Busca Padrão:** `"Voo de GRU para FOR no dia 20/05/2026"`
- **Ida e Volta (Contexto):** `"Preciso ir de São Paulo para Miami dia 15/04/2026 e voltar dia 22/04/2026"`
- **Pedido Vago (Teste de Memória):** `"Quero viajar para Paris saindo de GRU"` (O bot perguntará a data que falta).
- **Sensibilidade a Preço:** `"Busque o voo mais barato de GIG para FOR amanhã"`

## 💼 Casos de Uso de Negócio

### 1. Otimização de Upsell
Quando o agente detecta uma **Oportunidade: Alta** (Preço abaixo do limite), ele sugere:
- Propor um upgrade de quarto, já que o voo foi mais barato que o esperado.
- Oferecer um pacote "Voo + Resort" com uma margem melhor.

### 2. Estratégia de Recuperação
Quando o agente detecta uma **Oportunidade: Baixa** (Preço acima do limite), ele sugere:
- Destacar a flexibilidade de datas para o cliente.
- Oferecer um crédito no resort (ex: voucher de $50 no SPA) para compensar a passagem cara e garantir a reserva do hotel.

### 3. Qualificação de Leads
O sistema registra automaticamente cada busca no **PostgreSQL**, permitindo que a equipe de vendas:
- Veja quais destinos são mais procurados.
- Faça follow-up com usuários que buscaram voos mas ainda não reservaram o hotel.

---

## 🛠️ Configuração

Você pode ajustar os gatilhos de "Oportunidade" no arquivo `.env` ou no código:
- `PRICE_THRESHOLD_LOW`: Abaixo deste preço, a oportunidade é **ALTA** (🟢).
- `PRICE_THRESHOLD_MEDIUM`: Acima deste, mas abaixo de um segundo limite, é **MÉDIA** (🟡).
- Padrão: Voos acima de R$ 600 são considerados oportunidade **BAIXA** (🔴) para estratégias de upsell baseadas em preço.
