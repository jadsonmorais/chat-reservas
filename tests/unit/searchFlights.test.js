import { describe, it, expect, vi, beforeEach } from 'vitest';
import searchFlights from '../../src/skills/searchFlights.js';
import { getSerpApiClient } from '../../src/services/serpApi.js';

vi.mock('../../src/services/serpApi.js', () => {
  const mockClient = { search: vi.fn() };
  return { getSerpApiClient: vi.fn(() => mockClient) };
});

describe('searchFlights', () => {
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = getSerpApiClient();
  });

  it('processa resultado de voos corretamente', async () => {
    mockClient.search.mockResolvedValue({
      best_flights: [{ price: 1000, flights: [{ airline: 'LATAM' }] }],
      other_flights: [],
    });

    const result = await searchFlights({ origin: 'GRU', destination: 'FOR', departureDate: '2026-06-15' });

    expect(result.bestFlight.price).toBe(1000);
    expect(result.allFlights).toHaveLength(1);
    expect(result.searchMetadata.origin).toBe('GRU');
    expect(result.searchMetadata.destination).toBe('FOR');
  });

  it('cheapestFlight é o voo de menor preço entre best e other', async () => {
    mockClient.search.mockResolvedValue({
      best_flights: [{ price: 1200 }],
      other_flights: [{ price: 850 }, { price: 990 }],
    });

    const result = await searchFlights({ origin: 'GRU', destination: 'FOR', departureDate: '2026-06-15' });

    expect(result.cheapestFlight.price).toBe(850);
    expect(result.allFlights).toHaveLength(3);
  });

  it('retorna bestFlight e cheapestFlight null quando sem resultados', async () => {
    mockClient.search.mockResolvedValue({ best_flights: [], other_flights: [] });

    const result = await searchFlights({ origin: 'GRU', destination: 'FOR', departureDate: '2026-06-15' });

    expect(result.bestFlight).toBeNull();
    expect(result.cheapestFlight).toBeNull();
  });

  it('retenta em erro 5xx e retorna resultado da segunda tentativa', async () => {
    // Mocks configurados ANTES de chamar searchFlights
    mockClient.search
      .mockRejectedValueOnce(new Error('HTTP 500: Server Error'))
      .mockResolvedValueOnce({ best_flights: [], other_flights: [] });

    vi.useFakeTimers();
    const searchPromise = searchFlights({ origin: 'GRU', destination: 'FOR', departureDate: '2026-06-15' });
    await vi.runAllTimersAsync();
    const result = await searchPromise;

    expect(mockClient.search).toHaveBeenCalledTimes(2);
    expect(result.bestFlight).toBeNull();
    vi.useRealTimers();
  });

  it('lança erro após esgotar todas as tentativas', async () => {
    mockClient.search.mockRejectedValue(new Error('HTTP 503: Unavailable'));

    vi.useFakeTimers();
    // Anexa o rejection handler ANTES de avançar os timers para evitar PromiseRejectionHandledWarning
    const assertion = expect(
      searchFlights({ origin: 'GRU', destination: 'FOR', departureDate: '2026-06-15' })
    ).rejects.toThrow('HTTP 503');
    await vi.runAllTimersAsync();
    await assertion;

    expect(mockClient.search).toHaveBeenCalledTimes(3); // initial + 2 retries
    vi.useRealTimers();
  });
});
