/**
 * searchCompetitors.js
 * Busca simultânea de voos para Fortaleza + principais destinos concorrentes,
 * permitindo análise de posicionamento competitivo de preço.
 */

import searchFlights from './searchFlights.js';

export const COMPETITORS = [
  { code: 'BPS', name: 'Trancoso/Porto Seguro (BA)', hotels: 'Uxua, Etnia, Txai' },
  { code: 'FEN', name: 'Fernando de Noronha (PE)',   hotels: 'Pousadas premium'   },
  { code: 'MCZ', name: 'Maragogi/P. de Galinhas (AL)', hotels: 'Kenoa, Summerville' },
  { code: 'CAW', name: 'Búzios/Cabo Frio (RJ)',      hotels: 'Insolito, Casas Brancas' },
  { code: 'NAT', name: 'Natal/Pipa (RN)',            hotels: 'Tivoli Ecoresort'  },
];

const OUR_DESTINATION = { code: 'FOR', name: 'Fortaleza/Ceará' };

/**
 * Busca voos do mesmo hub para Fortaleza e todos os destinos concorrentes.
 *
 * @param {object} params
 * @param {string} params.origin        Hub de origem (IATA, ex: "GRU")
 * @param {string} params.departureDate ISO date (YYYY-MM-DD)
 * @param {string} [params.returnDate]  ISO date (opcional)
 * @returns {Promise<{ our: object, competitors: Array }>}
 */
export default async function searchCompetitors({ origin, departureDate, returnDate = null }) {
  const allDestinations = [OUR_DESTINATION, ...COMPETITORS];

  const results = await Promise.all(
    allDestinations.map(async (dest) => {
      try {
        const res = await searchFlights({ origin, destination: dest.code, departureDate, returnDate });
        const price = res.cheapestFlight?.price ?? res.bestFlight?.price ?? null;
        return {
          ...dest,
          price,
          cheapestFlight: res.cheapestFlight,
          bestFlight: res.bestFlight,
          error: null,
        };
      } catch (err) {
        console.error(`[searchCompetitors] ${origin}→${dest.code} failed:`, err.message);
        return { ...dest, price: null, error: err.message };
      }
    }),
  );

  const [our, ...competitors] = results;
  return { our, competitors };
}
