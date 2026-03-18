"""
services/evolution_api.py — Evolution API integration.

send_message()        → sends WhatsApp text via Evolution API
format_response()     → wraps agent output into { human_message, system_metadata }
build_human_message() → formats flight results as WhatsApp-ready markdown text
"""

import os
from datetime import datetime, timezone
import httpx

TIMEOUT = 15.0


# ── Sending ──────────────────────────────────────────────────

def send_message(phone: str, text: str, instance_name: str | None = None) -> dict:
    base_url = os.environ.get("EVOLUTION_API_URL")
    api_key = os.environ.get("EVOLUTION_API_KEY")
    instance = instance_name or os.environ.get("EVOLUTION_INSTANCE_NAME")

    if not base_url or not api_key or not instance:
        raise RuntimeError(
            "[EvolutionApi] Missing EVOLUTION_API_URL, EVOLUTION_API_KEY, or EVOLUTION_INSTANCE_NAME"
        )

    url = f"{base_url}/message/sendText/{instance}"

    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.post(
            url,
            headers={"Content-Type": "application/json", "apikey": api_key},
            json={"number": phone, "text": text},
        )

    if response.status_code >= 400:
        raise RuntimeError(f"[EvolutionApi] HTTP {response.status_code}: {response.text[:200]}")

    return response.json()


# ── Response Formatting ──────────────────────────────────────

def format_response(
    text: str,
    opportunity_level: str = "unknown",
    suggestions: list | None = None,
    price_analysis: dict | None = None,
    search_params: dict | None = None,
) -> dict:
    return {
        "human_message": text,
        "system_metadata": {
            "type": "flight_search_response",
            "opportunity_level": opportunity_level,
            "suggestions": suggestions or [],
            "price_analysis": price_analysis or {},
            "search_params": search_params or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }


def build_human_message(
    multi_results: list | None = None,
    destination: str = "",
    departure_date: str = "",
    return_date: str | None = None,
    best_flight: dict | None = None,
    cheapest_flight: dict | None = None,
    opportunity_level: str | None = None,
    suggestions: list | None = None,
) -> str:
    lines = [
        "🚀 *ANÁLISE TÉCNICA DE MALHA AÉREA*",
        f"🎯 Destino: *{destination.upper()}*",
        f"📅 Período: {departure_date}"
        + (f" até {return_date}" if return_date else " (Somente Ida)"),
        "────────────────────────",
    ]

    if multi_results:
        successful = [
            r for r in multi_results
            if not r.get("error") and (
                (r.get("flight_results") or {}).get("best_flight")
                or (r.get("flight_results") or {}).get("cheapest_flight")
            )
        ]

        if not successful:
            lines.append("⚠️ Nenhuma opção viável encontrada nos principais hubs para estas datas.")
            return "\n".join(lines)

        global_options = sorted(
            [
                {
                    "origin": r["origin"],
                    "price": (
                        (r["flight_results"].get("cheapest_flight") or {}).get("price")
                        or (r["flight_results"].get("best_flight") or {}).get("price")
                    ),
                    "opportunity": r.get("opportunity", {}),
                }
                for r in successful
            ],
            key=lambda x: x["price"] or float("inf"),
        )

        best_global = global_options[0]

        lines += [
            "",
            "🌟 *MELHOR OPORTUNIDADE GLOBAL*",
            f"📍 Origem: *{best_global['origin']}*",
            f"💰 Preço: {_format_currency(best_global['price'])}",
            f"📊 Status: {_emoji_badge(best_global['opportunity'].get('opportunity_level', 'unknown'))}",
            "",
            "📋 *RESUMO POR HUB (MÉDIA DE PREÇO)*",
        ]

        for res in successful:
            fr = res["flight_results"]
            p = (fr.get("cheapest_flight") or {}).get("price") or (fr.get("best_flight") or {}).get("price")
            status = _emoji_badge(res.get("opportunity", {}).get("opportunity_level", "unknown"))
            lines.append(f"{status} *{res['origin']}*: {_format_currency(p) if p else 'N/A'}")

        lines += ["", "💡 *INSIGHTS E ESTRATÉGIA DE CONVERSÃO*"]

        all_suggestions = list(dict.fromkeys(
            s for r in successful for s in (r.get("opportunity", {}).get("suggestions") or [])
        ))
        for s in all_suggestions[:4]:
            lines.append(f" • {s}")

    else:
        # Single result (legacy)
        origin = (multi_results or [{}])[0].get("origin", "Origem") if multi_results else "Origem"
        lines += ["", f"📍 Rota: *{origin}* → *{destination}*", ""]

        if best_flight:
            lines += ["🏆 *Opção Recomendada:*", _format_flight_summary(best_flight), ""]

        badge = _emoji_badge(opportunity_level or "unknown")
        lines += [f"📊 *Análise de Mercado:* {badge}", ""]

        if suggestions:
            lines.append("💡 *Direcionamento de Venda:*")
            for s in suggestions:
                lines.append(f" • {s}")

    return "\n".join(lines)


# ── Internal helpers ─────────────────────────────────────────

def _emoji_badge(level: str) -> str:
    return {
        "high": "🟢 ALTA",
        "medium": "🟡 MÉDIA",
        "low": "🔴 BAIXA",
        "unknown": "⚪ N/A",
    }.get(level, "⚪ N/A")


def _format_currency(value) -> str:
    if value is None:
        return "N/D"
    # Manual BRL formatter (avoids locale dependency in Alpine)
    try:
        val = float(value)
        formatted = f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"R$ {formatted}"
    except (TypeError, ValueError):
        return "N/D"


def _format_flight_summary(flight: dict) -> str:
    legs = flight.get("flights") or []
    parts = []

    if flight.get("price") is not None:
        parts.append(f"💵 R$ {flight['price']}")

    duration = flight.get("total_duration")
    if duration is not None:
        h, m = divmod(int(duration), 60)
        parts.append(f"⏱️ {h}h{m}min" if m else f"⏱️ {h}h")

    if legs:
        airlines = list(dict.fromkeys(leg.get("airline") for leg in legs if leg.get("airline")))
        if airlines:
            parts.append(f"🛩️ {', '.join(airlines)}")
        stops = len(legs) - 1
        parts.append("Direto" if stops == 0 else f"{stops} escala(s)")

    return " | ".join(parts)
