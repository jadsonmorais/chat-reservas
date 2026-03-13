import { query } from '../db/pool.js';

const MAX_MESSAGES = 5;

/**
 * Retrieve the last N messages for a given conversation (short-term memory).
 *
 * @param {string} conversationId
 * @param {number} [limit=5]  Number of recent messages to return
 * @returns {Promise<Array<{role: string, content: string, metadata: object, createdAt: string}>>}
 */
export default async function getConversationHistory(conversationId, limit = MAX_MESSAGES) {
  if (!conversationId) {
    return [];
  }

  try {
    const result = await query(
      `SELECT role, content, metadata, created_at AS "createdAt"
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit],
    );

    // Return in chronological order (oldest first)
    return result.rows.reverse();
  } catch (err) {
    console.error('[getConversationHistory] Failed to fetch history:', err.message);
    return [];
  }
}
