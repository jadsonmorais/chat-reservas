import { describe, it, expect } from 'vitest';
import { buildHumanMessage, formatResponse } from '../../src/services/evolutionApi.js';

describe('EvolutionApi Utilities', () => {
  describe('formatResponse', () => {
    it('should format clean metadata', () => {
      const input = {
        text: 'Hello',
        opportunityLevel: 'high',
        suggestions: ['Buy'],
        priceAnalysis: {},
        searchParams: {}
      };
      const result = formatResponse(input);
      expect(result.humanMessage).toBe('Hello');
      expect(result.systemMetadata.opportunityLevel).toBe('high');
    });
  });

  describe('buildHumanMessage', () => {
    it('should build a formatted string for single results', () => {
      const message = buildHumanMessage({
        destination: 'MIA',
        departureDate: '2026-06-15',
        bestFlight: { price: 1500, total_duration: 600, flights: [{ airline: 'LATAM' }] },
        opportunityLevel: 'high',
        suggestions: ['Suggestion 1']
      });

      expect(message).toContain('MIA');
      expect(message).toContain('LATAM');
      expect(message).toContain('ALTA');
      expect(message).toContain('Suggestion 1');
    });
  });
});
