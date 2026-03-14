import { describe, it, expect, beforeEach } from 'vitest';
import analyzeSalesOpportunity from '../../src/skills/analyzeSalesOpportunity.js';

// Garante thresholds fixos independente do .env
beforeEach(() => {
  process.env.PRICE_THRESHOLD_LOW = '300';
  process.env.PRICE_THRESHOLD_MEDIUM = '600';
});

describe('analyzeSalesOpportunity', () => {
  it('retorna high para preços abaixo do threshold low', () => {
    const result = analyzeSalesOpportunity({
      bestFlight: { price: 200 },
      cheapestFlight: { price: 150 },
      destination: 'FOR',
    });
    expect(result.opportunityLevel).toBe('high');
    expect(result.suggestions.join('')).toContain('Tarifa extremamente competitiva');
  });

  it('retorna medium para preços na faixa intermediária', () => {
    const result = analyzeSalesOpportunity({
      bestFlight: { price: 500 },
      cheapestFlight: { price: 450 },
      destination: 'FOR',
    });
    expect(result.opportunityLevel).toBe('medium');
  });

  it('retorna low para preços acima do threshold medium', () => {
    const result = analyzeSalesOpportunity({
      bestFlight: { price: 1000 },
      cheapestFlight: { price: 900 },
      destination: 'FOR',
    });
    expect(result.opportunityLevel).toBe('low');
  });

  it('retorna unknown quando não há preço disponível', () => {
    const result = analyzeSalesOpportunity({
      bestFlight: null,
      cheapestFlight: null,
      destination: 'FOR',
    });
    expect(result.opportunityLevel).toBe('unknown');
    expect(result.priceAnalysis.price).toBeNull();
  });

  it('historico abaixo da média promove medium → high', () => {
    // Preço atual: 500 (medium). Média histórica: 850. Diff: -41% → promove para high
    const result = analyzeSalesOpportunity({
      bestFlight: { price: 500 },
      cheapestFlight: { price: 500 },
      destination: 'FOR',
      historicalPrices: [{ price: 800 }, { price: 900 }],
    });
    expect(result.opportunityLevel).toBe('high');
    expect(result.priceAnalysis.historical.percentDiff).toBe(-41);
  });

  it('historico abaixo da média promove low → medium', () => {
    // Preço atual: 700 (low). Média histórica: 1000. Diff: -30% → promove para medium
    const result = analyzeSalesOpportunity({
      bestFlight: { price: 700 },
      cheapestFlight: { price: 700 },
      destination: 'FOR',
      historicalPrices: [{ price: 1000 }, { price: 1000 }],
    });
    expect(result.opportunityLevel).toBe('medium');
  });

  it('usa cheapestFlight.price quando disponível (ignora bestFlight)', () => {
    const result = analyzeSalesOpportunity({
      bestFlight: { price: 800 },   // seria low
      cheapestFlight: { price: 150 }, // deve prevalecer → high
      destination: 'FOR',
    });
    expect(result.opportunityLevel).toBe('high');
    expect(result.priceAnalysis.price).toBe(150);
  });

  it('priceAnalysis.thresholds reflete os valores do env', () => {
    const result = analyzeSalesOpportunity({
      bestFlight: { price: 400 },
      cheapestFlight: null,
      destination: 'FOR',
    });
    expect(result.priceAnalysis.thresholds.low).toBe(300);
    expect(result.priceAnalysis.thresholds.medium).toBe(600);
  });
});
