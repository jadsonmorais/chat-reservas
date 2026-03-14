import { describe, it, expect, vi, beforeEach } from 'vitest';
import searchCompetitors, { COMPETITORS } from '../../src/skills/searchCompetitors.js';

vi.mock('../../src/skills/searchFlights.js', () => ({
  default: vi.fn(),
}));

import searchFlights from '../../src/skills/searchFlights.js';

const makeFlight = (price) => ({
  cheapestFlight: { price },
  bestFlight: { price: price + 50 },
});

describe('searchCompetitors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna { our, competitors } com estrutura correta', async () => {
    searchFlights.mockResolvedValue(makeFlight(400));

    const result = await searchCompetitors({
      origin: 'GRU',
      departureDate: '2026-06-20',
    });

    expect(result).toHaveProperty('our');
    expect(result).toHaveProperty('competitors');
    expect(result.competitors).toHaveLength(COMPETITORS.length);
  });

  it('our.code === "FOR" e price vem do cheapestFlight', async () => {
    searchFlights.mockResolvedValue(makeFlight(350));

    const { our } = await searchCompetitors({ origin: 'GRU', departureDate: '2026-06-20' });

    expect(our.code).toBe('FOR');
    expect(our.price).toBe(350);
  });

  it('falha em um destino não cancela os demais', async () => {
    // Primeiro call (FOR) ok, segundo falha, restantes ok
    searchFlights
      .mockResolvedValueOnce(makeFlight(400))     // FOR
      .mockRejectedValueOnce(new Error('timeout')) // BPS
      .mockResolvedValue(makeFlight(600));          // demais

    const { our, competitors } = await searchCompetitors({
      origin: 'GRU',
      departureDate: '2026-06-20',
    });

    expect(our.price).toBe(400);
    // destino com erro retorna price: null e error preenchido
    const failed = competitors.find((c) => c.error);
    expect(failed).toBeDefined();
    expect(failed.price).toBeNull();
    // os outros continuam com preço
    const ok = competitors.filter((c) => !c.error);
    expect(ok.length).toBeGreaterThan(0);
    ok.forEach((c) => expect(c.price).toBe(600));
  });

  it('busca é feita com os parâmetros corretos', async () => {
    searchFlights.mockResolvedValue(makeFlight(500));

    await searchCompetitors({ origin: 'BSB', departureDate: '2026-07-01', returnDate: '2026-07-07' });

    // Verifica que FOR foi buscado com os params certos
    expect(searchFlights).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'BSB', destination: 'FOR', departureDate: '2026-07-01', returnDate: '2026-07-07' }),
    );
  });
});
