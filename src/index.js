import 'dotenv/config';
import app from './server.js';
import { initDatabase } from './db/init.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── Bootstrap ───────────────────────────────────────────────
try {
  await initDatabase();
} catch {
  console.warn('[Startup] ⚠️  Database unavailable — running in stateless mode');
}

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🏨  Chat Reservas — Booking Agent          ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║   🚀  Server running on port ${String(PORT).padEnd(15)}║`);
  console.log(`║   📡  Webhook: POST /webhook/evolution       ║`);
  console.log(`║   🧪  Test:    POST /test/message             ║`);
  console.log(`║   ❤️   Health:  GET  /health                   ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
