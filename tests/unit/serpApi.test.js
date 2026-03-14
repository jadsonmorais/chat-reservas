import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SerpApiClient } from '../../src/services/serpApi.js';

describe('SerpApiClient', () => {
  const apiKey = 'test_key';
  let client;

  beforeEach(() => {
    client = new SerpApiClient(apiKey);
    global.fetch = vi.fn();
  });

  it('should build correct URL and parameters', async () => {
    const mockResponse = { results: [] };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await client.search('google_flights', { q: 'test' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('engine=google_flights'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api_key=test_key'),
      expect.any(Object)
    );
    expect(result).toEqual(mockResponse);
  });

  it('should throw error on failure', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('External Error')
    });

    await expect(client.search('google_flights')).rejects.toThrow('HTTP 500: External Error');
  });
});
