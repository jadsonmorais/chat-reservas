"""
agent/webhook.py — Flask Blueprint: Evolution API webhook + test endpoint + health check.
"""

import time
from flask import Blueprint, request, jsonify, current_app

from app.services.evolution_api import send_message
from .agent import handle_message

webhook_bp = Blueprint("webhook", __name__)


# ── Health check ─────────────────────────────────────────────

@webhook_bp.route("/health")
def health():
    return jsonify({"status": "ok", "uptime": time.time()})


# ── Evolution API webhook ─────────────────────────────────────

@webhook_bp.route("/webhook/evolution", methods=["POST"])
def evolution_webhook():
    payload = request.get_json(silent=True) or {}

    # Filter: only process messages.upsert events
    if payload.get("event") != "messages.upsert":
        return jsonify({"ignored": True}), 200

    data = payload.get("data", {})
    key = data.get("key", {})
    message_obj = data.get("message", {})

    # Ignore bot-sent messages
    if key.get("fromMe"):
        return jsonify({"ignored": True}), 200

    # Extract text content
    message_content = (
        message_obj.get("conversation")
        or (message_obj.get("extendedTextMessage") or {}).get("text")
        or ""
    ).strip()

    if not message_content:
        return jsonify({"ignored": True}), 200

    conversation_id = key.get("remoteJid", "")
    customer_phone = conversation_id.split("@")[0] if "@" in conversation_id else conversation_id

    try:
        response = handle_message(
            conversation_id=conversation_id,
            customer_phone=customer_phone,
            message_content=message_content,
        )
    except Exception as err:
        current_app.logger.error(f"[Webhook] Agent error: {err}")
        return jsonify({"error": str(err)}), 500

    # Send reply via Evolution API
    try:
        send_message(conversation_id, response["human_message"])
    except Exception as err:
        current_app.logger.warning(f"[Webhook] Failed to send reply: {err}")

    return jsonify({"success": True, "response": response})


# ── Manual test endpoint (bypasses Evolution API) ─────────────

@webhook_bp.route("/test/message", methods=["POST"])
def test_message():
    body = request.get_json(silent=True) or {}
    message_content = body.get("message", "").strip()
    phone = body.get("phone", "+55_WEB_TEST")

    if not message_content:
        return jsonify({"error": "message is required"}), 400

    conversation_id = f"{phone}@s.whatsapp.net"

    try:
        response = handle_message(
            conversation_id=conversation_id,
            customer_phone=phone,
            message_content=message_content,
        )
    except Exception as err:
        current_app.logger.error(f"[Test] Agent error: {err}")
        return jsonify({"error": str(err)}), 500

    return jsonify(response)


# ── Static UI ─────────────────────────────────────────────────

@webhook_bp.route("/")
def index():
    return current_app.send_static_file("index.html")
