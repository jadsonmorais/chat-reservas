import express from 'express';
import { handleMessage } from './agent/agent.js';
import { sendMessage } from './services/evolutionApi.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
// Serve the front-end chat interface
app.use(express.static(join(__dirname, '../public')));

// ── Health check ────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Evolution API Webhook ───────────────────────────────────
app.post('/webhook/evolution', async (req, res) => {
  try {
    const payload = req.body;

    // Evolution API sends different event types — we only care about messages
    const event = payload.event;
    if (event !== 'messages.upsert') {
      return res.status(200).json({ ignored: true, event });
    }

    const data = payload.data;
    if (!data) {
      return res.status(400).json({ error: 'Missing data in webhook payload' });
    }

    // ── Extract message info ──
    const message = data.message;
    const messageContent =
      message?.conversation ??
      message?.extendedTextMessage?.text ??
      null;

    if (!messageContent) {
      return res.status(200).json({ ignored: true, reason: 'non-text message' });
    }

    const conversationId = data.key?.remoteJid;
    const customerPhone = conversationId?.replace('@s.whatsapp.net', '') ?? 'unknown';

    // Don't process messages sent by the bot itself
    if (data.key?.fromMe) {
      return res.status(200).json({ ignored: true, reason: 'fromMe' });
    }

    console.log(`[Webhook] Message from ${customerPhone}: ${messageContent.substring(0, 80)}…`);

    // ── Process through the agent ──
    const response = await handleMessage({
      conversationId,
      customerPhone,
      messageContent,
    });

    // ── Send reply via Evolution API ──
    try {
      await sendMessage(conversationId, response.humanMessage);
      console.log(`[Webhook] Reply sent to ${customerPhone}`);
    } catch (sendErr) {
      console.error('[Webhook] Failed to send reply:', sendErr.message);
      // Don't fail the webhook — the response was still generated
    }

    res.json({
      success: true,
      response,
    });
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Manual test endpoint (bypasses Evolution API) ───────────
app.post('/test/message', async (req, res) => {
  try {
    const { conversationId, customerPhone, message } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        error: 'Missing required fields: conversationId, message',
      });
    }

    const response = await handleMessage({
      conversationId,
      customerPhone: customerPhone ?? 'test-user',
      messageContent: message,
    });

    res.json(response);
  } catch (err) {
    console.error('[Test] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Centralised error handler ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
