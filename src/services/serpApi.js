const SERPAPI_BASE = 'https://serpapi.com/search.json';

/**
 * Thin wrapper around the SerpApi HTTP API.
 */
export class SerpApiClient {
  #apiKey;

  constructor(apiKey) {
    if (!apiKey) throw new Error('[SerpApiClient] Missing API key');
    this.#apiKey = apiKey;
  }

  /**
   * Execute a search request against SerpApi.
   *
   * @param {string} engine   SerpApi engine name (e.g. "google_flights")
   * @param {Record<string,string>} params  Engine-specific query params
   * @returns {Promise<object>}  Parsed JSON response
   */
  async search(engine, params = {}) {
    const qs = new URLSearchParams({
      engine,
      api_key: this.#apiKey,
      ...params,
    });

    const url = `${SERPAPI_BASE}?${qs.toString()}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[SerpApiClient] HTTP ${res.status}: ${body}`);
    }

    return res.json();
  }
}

/** Singleton instance using env var. */
let _instance;

export function getSerpApiClient() {
  if (!_instance) {
    _instance = new SerpApiClient(process.env.SERPAPI_KEY);
  }
  return _instance;
}
