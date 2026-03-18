"""
services/gemini_service.py — Narrative insights via Gemini API (google-genai SDK).
Gracefully deactivates if GEMINI_API_KEY is not set.
"""

import os
from google import genai
from google.genai import types

_client: genai.Client | None = None
MODEL = "gemini-2.0-flash"

SYSTEM_PROMPT = (
    "Você é um analista comercial sênior de um resort de luxo no Ceará. "
    "Sua função é transformar dados de voo em insights acionáveis para a equipe de reservas. "
    "Seja direto, prático e foque em oportunidades de abordagem comercial. "
    "Máximo 3 linhas. Sem bullet points. Tom profissional."
)


def _get_client() -> genai.Client | None:
    global _client
    if not os.environ.get("GEMINI_API_KEY"):
        return None
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


def insight_market_overview(results: list, destination: str, date: str) -> str | None:
    """Insight for market overview (all hubs → FOR)."""
    c = _get_client()
    if not c:
        return None

    price_list = " | ".join(
        f"{r['origin']}: R${r['price']} ({r['level']})"
        for r in sorted(results, key=lambda x: x.get("price") or float("inf"))
        if not r.get("error") and r.get("price")
    )
    if not price_list:
        return None

    return _call_gemini(
        c,
        f"Dados de voo para {destination} em {date}: {price_list}. "
        f"Qual o nível de oportunidade geral? Qual hub priorizar? Que abordagem usar com o cliente?",
    )


def insight_competitive(for_result: dict, competitors: list, origin: str, date: str) -> str | None:
    """Insight for competitive analysis (FOR vs competitors)."""
    c = _get_client()
    if not c:
        return None

    for_price = for_result.get("price", "N/D") if for_result else "N/D"
    comp_list = " | ".join(
        f"{cp['name']}: R${cp['price']}"
        for cp in competitors
        if not cp.get("error") and cp.get("price")
    )
    if not comp_list:
        return None

    return _call_gemini(
        c,
        f"Preço {origin}→Fortaleza em {date}: R${for_price}. "
        f"Destinos concorrentes: {comp_list}. "
        f"Fortaleza está competitiva? Há janela de captação vs esses destinos?",
    )


def insight_best_window(windows: list, origin: str) -> str | None:
    """Insight for best booking window."""
    c = _get_client()
    if not c:
        return None

    top = " | ".join(
        f"{w['date_label']}: R${w['price']}"
        for w in windows[:6]
    )
    if not top:
        return None

    return _call_gemini(
        c,
        f"Preços {origin}→Fortaleza nas próximas 2 semanas: {top}. "
        f"Qual período priorizar para captação ativa? Por quê?",
    )


# ── Internal ─────────────────────────────────────────────────

def _call_gemini(client: genai.Client, user_message: str) -> str | None:
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=SYSTEM_PROMPT + "\n\n" + user_message,
            config=types.GenerateContentConfig(max_output_tokens=220),
        )
        text = response.text
        return text.strip() if text else None
    except Exception as e:
        print(f"[Gemini] Insight failed: {e}")
        return None
