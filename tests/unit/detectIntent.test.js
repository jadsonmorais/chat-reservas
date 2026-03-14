/**
 * Tests for detectIntent — the menu routing logic in agent.js.
 * This is the most critical pure-logic function: it decides which
 * commercial flow runs based on the user message + conversation history.
 */

import { describe, it, expect, vi } from 'vitest';

// agent.js importa claudeService que importa @anthropic-ai/sdk.
// Como testamos apenas lógica pura de roteamento, mockamos as dependências externas.
vi.mock('../../src/services/claudeService.js', () => ({
  insightMarketOverview: vi.fn().mockResolvedValue(null),
  insightCompetitive: vi.fn().mockResolvedValue(null),
  insightBestWindow: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/db/pool.js', () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock('../../src/skills/searchFlights.js', () => ({ default: vi.fn() }));
vi.mock('../../src/skills/searchCompetitors.js', () => ({ default: vi.fn() }));
vi.mock('../../src/skills/getConversationHistory.js', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/skills/getRecentSearches.js', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/skills/persistTransaction.js', () => ({ default: vi.fn() }));

import { detectIntent } from '../../src/agent/agent.js';

// Helper: build a history where the last assistant message is the menu
const menuHistory = [
  { role: 'assistant', content: 'Mensagem anterior qualquer' },
  { role: 'user',      content: 'oi' },
  { role: 'assistant', content: 'Resposta com 1️⃣ no menu' },
];

// Helper: history with no assistant message containing menu
const emptyHistory = [];
const noMenuHistory = [
  { role: 'user',      content: 'busca voo gru for' },
  { role: 'assistant', content: 'Aqui estão os resultados...' },
];

describe('detectIntent — menu ativo (roteamento por número)', () => {
  it('"1" → MARKET_OVERVIEW quando menu estava ativo', () => {
    expect(detectIntent('1', menuHistory)).toBe('MARKET_OVERVIEW');
  });

  it('"2" → COMPETITIVE', () => {
    expect(detectIntent('2', menuHistory)).toBe('COMPETITIVE');
  });

  it('"3" → BEST_WINDOW', () => {
    expect(detectIntent('3', menuHistory)).toBe('BEST_WINDOW');
  });

  it('"4" → HUB_RANKING', () => {
    expect(detectIntent('4', menuHistory)).toBe('HUB_RANKING');
  });

  it('"5" → CUSTOM', () => {
    expect(detectIntent('5', menuHistory)).toBe('CUSTOM');
  });

  it('"1" com espaço nas bordas → MARKET_OVERVIEW', () => {
    expect(detectIntent('  1  ', menuHistory)).toBe('MARKET_OVERVIEW');
  });
});

describe('detectIntent — menu INATIVO (sem 1️⃣ no histórico)', () => {
  it('"1" sem menu ativo → GREETING (não roteia por número)', () => {
    expect(detectIntent('1', noMenuHistory)).toBe('GREETING');
  });

  it('"1" sem histórico → GREETING', () => {
    expect(detectIntent('1', emptyHistory)).toBe('GREETING');
  });
});

describe('detectIntent — keywords diretas', () => {
  it('"concorrentes" → COMPETITIVE', () => {
    expect(detectIntent('concorrentes', emptyHistory)).toBe('COMPETITIVE');
  });

  it('"radar competitivo" → COMPETITIVE', () => {
    expect(detectIntent('quero ver o radar competitivo', emptyHistory)).toBe('COMPETITIVE');
  });

  it('"janela" → BEST_WINDOW', () => {
    expect(detectIntent('melhor janela de captação', emptyHistory)).toBe('BEST_WINDOW');
  });

  it('"ranking" → HUB_RANKING', () => {
    expect(detectIntent('ranking de hubs', emptyHistory)).toBe('HUB_RANKING');
  });

  it('"mais barato" → HUB_RANKING', () => {
    expect(detectIntent('qual o mais barato', emptyHistory)).toBe('HUB_RANKING');
  });

  it('"mercado hoje" → MARKET_OVERVIEW', () => {
    expect(detectIntent('mercado hoje', emptyHistory)).toBe('MARKET_OVERVIEW');
  });
});

describe('detectIntent — saudações → GREETING', () => {
  it('"oi" → GREETING', () => {
    expect(detectIntent('oi', emptyHistory)).toBe('GREETING');
  });

  it('"menu" → GREETING', () => {
    expect(detectIntent('menu', emptyHistory)).toBe('GREETING');
  });

  it('"bom dia" → GREETING', () => {
    expect(detectIntent('bom dia', emptyHistory)).toBe('GREETING');
  });

  it('"ajuda" → GREETING', () => {
    expect(detectIntent('ajuda', emptyHistory)).toBe('GREETING');
  });
});

describe('detectIntent — busca com IATA → CUSTOM', () => {
  it('mensagem com "GRU FOR" → CUSTOM', () => {
    expect(detectIntent('voo GRU FOR 20/04/2026', emptyHistory)).toBe('CUSTOM');
  });

  it('"passagem para fortaleza" → CUSTOM', () => {
    expect(detectIntent('passagem para fortaleza', emptyHistory)).toBe('CUSTOM');
  });
});

describe('detectIntent — menu ativo não bloqueia keywords (fallback)', () => {
  it('keyword "concorrentes" prevalece mesmo com menu ativo', () => {
    // Texto não é número, cai no keyword matching
    expect(detectIntent('concorrentes', menuHistory)).toBe('COMPETITIVE');
  });

  it('texto genérico com menu ativo → cai em GREETING (sem match)', () => {
    expect(detectIntent('como vai você?', menuHistory)).toBe('GREETING');
  });
});
