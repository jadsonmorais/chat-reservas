"""
skills/analyze_sales_opportunity.py — Pure logic: no I/O.

Classifies flight price into opportunity level (high/medium/low)
and generates upsell suggestions for the sales team.
"""

import os


def analyze_sales_opportunity(
    best_flight: dict | None,
    cheapest_flight: dict | None,
    destination: str,
    historical_prices: list | None = None,
) -> dict:
    """
    Returns { opportunity_level, suggestions, price_analysis }.

    opportunity_level: "high" | "medium" | "low" | "unknown"
    """
    price_low = float(os.environ.get("PRICE_THRESHOLD_LOW", 300))
    price_medium = float(os.environ.get("PRICE_THRESHOLD_MEDIUM", 600))

    price = (
        (cheapest_flight or {}).get("price")
        or (best_flight or {}).get("price")
    )

    if price is None:
        return {
            "opportunity_level": "unknown",
            "suggestions": ["Não foi possível determinar o preço. Verificar manualmente."],
            "price_analysis": {"price": None, "thresholds": {"low": price_low, "medium": price_medium}},
        }

    price = float(price)
    suggestions = []

    if price <= price_low:
        opportunity_level = "high"
        suggestions += [
            f"🎯 *Insight:* Tarifa extremamente competitiva detected ({_fmt(price)}).",
            "💰 *Estratégia:* O cliente possui alta margem de economia. Priorizar oferta de upgrade para suíte premium ou reserva de 1 noite extra.",
            "✨ *Incentivo:* Propor pacote 'Experience' (jantar romântico ou SPA) como cortesia pelo fechamento imediato.",
        ]
    elif price <= price_medium:
        opportunity_level = "medium"
        suggestions += [
            f"📊 *Insight:* Preço dentro da expectativa de mercado ({_fmt(price)}).",
            "🔄 *Estratégia:* Gatilho de escassez — informar que restam poucas vagas no hotel para o período, ancorando no valor do voo.",
            "🚗 *Valor Agregado:* Cortesia de transfer round-trip aeroporto-hotel pode ser o diferencial para conversão agora.",
        ]
    else:
        opportunity_level = "low"
        suggestions += [
            f"⚠️ *Atenção:* Custo de transporte elevado ({_fmt(price)}). Risco de desistência do hotel.",
            "📉 *Contorno:* Sugerir datas de partida +/- 2 dias. Frequentemente reduz custos em até 30%.",
            "🎁 *Retenção:* Oferecer crédito de consumo no resort (ex: R$ 300) para amortizar psicologicamente o custo do aéreo.",
        ]

    # Historical comparison
    hist = _analyse_historical(price, historical_prices or [])
    if hist["suggestion"]:
        suggestions.append(hist["suggestion"])

    if hist["percent_diff"] is not None and hist["percent_diff"] <= -15:
        if opportunity_level == "medium":
            opportunity_level = "high"
        elif opportunity_level == "low":
            opportunity_level = "medium"

    # Destination-specific tip
    tip = _destination_tip(destination)
    if tip:
        suggestions.append(tip)

    return {
        "opportunity_level": opportunity_level,
        "suggestions": suggestions,
        "price_analysis": {
            "price": price,
            "currency": "BRL",
            "thresholds": {"low": price_low, "medium": price_medium},
            "best_flight_price": (best_flight or {}).get("price"),
            "cheapest_flight_price": (cheapest_flight or {}).get("price"),
            "historical": hist,
        },
    }


# ── Helpers ──────────────────────────────────────────────────

def _analyse_historical(current_price: float, historical_prices: list) -> dict:
    valid = [float(h["price"]) for h in historical_prices if h.get("price") is not None]

    if not valid:
        return {"average_price": None, "percent_diff": None, "suggestion": None}

    avg = round(sum(valid) / len(valid))
    diff = round(((current_price - avg) / avg) * 100)

    if diff <= -15:
        suggestion = f"📉 Preço {abs(diff)}% abaixo da média histórica ({_fmt(avg)}) — ótima oportunidade!"
    elif diff <= -5:
        suggestion = f"📊 Preço {abs(diff)}% abaixo da média ({_fmt(avg)}) — momento favorável."
    elif diff >= 15:
        suggestion = f"📈 Preço {diff}% acima da média ({_fmt(avg)}) — sugerir datas alternativas."
    elif diff >= 5:
        suggestion = f"📊 Preço {diff}% acima da média ({_fmt(avg)}) — dentro da faixa normal."
    else:
        suggestion = None

    return {"average_price": avg, "percent_diff": diff, "suggestion": suggestion, "sample_size": len(valid)}


def _destination_tip(iata: str) -> str | None:
    tips = {
        "MIA": "🌴 Miami — sugerir passeio de barco em Biscayne Bay.",
        "MCO": "🎢 Orlando — oferecer ingressos de parques como add-on.",
        "CDG": "🗼 Paris — sugerir experiência gastronômica ou cruzeiro no Sena.",
        "FCO": "🏛️ Roma — oferecer tour guiado pelo Vaticano.",
        "LIS": "🇵🇹 Lisboa — sugerir passeio de tuk-tuk + degustação de vinhos.",
        "CUN": "🏖️ Cancún — sugerir pacote all-inclusive com upgrade.",
        "DXB": "🕌 Dubai — oferecer desert safari ou passeio de helicóptero.",
        "JFK": "🗽 Nova York — oferecer ingressos para Broadway.",
        "LHR": "🇬🇧 Londres — sugerir afternoon tea experience.",
    }
    return tips.get((iata or "").upper())


def _fmt(value) -> str:
    """Manual BRL formatter (no locale dependency)."""
    try:
        v = float(value)
        s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"R$ {s}"
    except (TypeError, ValueError):
        return "N/D"
