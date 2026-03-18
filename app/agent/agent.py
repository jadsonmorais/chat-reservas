"""
agent/agent.py — Motor de raciocínio comercial.

Intents disponíveis (menu ou keywords):
  1. MARKET_OVERVIEW  — voos de todos os hubs → FOR (default: próxima sexta)
  2. COMPETITIVE      — FOR vs destinos concorrentes
  3. BEST_WINDOW      — próximas 2 semanas, ranqueado por preço
  4. HUB_RANKING      — ranking de preços por hub para uma data
  5. CUSTOM           — busca com origem/destino/data livres
"""

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from app.db.pool import query
from app.services.evolution_api import format_response, build_human_message
from app.services.gemini_service import insight_market_overview, insight_competitive, insight_best_window
from app.skills.search_flights import search_flights
from app.skills.search_competitors import search_competitors
from app.skills.analyze_sales_opportunity import analyze_sales_opportunity
from app.skills.persist_transaction import persist_transaction
from app.skills.get_conversation_history import get_conversation_history
from app.skills.get_recent_searches import get_recent_searches

# ── Configuration ─────────────────────────────────────────────

HUBS = ["GRU", "BSB", "GIG", "CNF", "VCP", "REC", "SSA"]
OUR_DESTINATION = "FOR"

MENU_TEXT = (
    "👋 *Assistente Comercial — Chat Reservas*\n\n"
    "O que deseja analisar?\n\n"
    "1️⃣ *Mercado hoje* — voos para Fortaleza de todos os hubs\n"
    "2️⃣ *Radar competitivo* — Fortaleza vs destinos de luxo concorrentes\n"
    "3️⃣ *Melhor janela* — dias mais baratos nas próximas 2 semanas\n"
    "4️⃣ *Ranking de hubs* — qual cidade tem o voo mais barato agora\n"
    "5️⃣ *Busca específica* — origem, destino e data personalizados\n\n"
    "Responda com o número ou descreva o que precisa."
)

# ── Module-level state (stateless mode flag) ──────────────────

_db_unavailable = False


# ── Entry point ───────────────────────────────────────────────

def handle_message(conversation_id: str, customer_phone: str, message_content: str) -> dict:
    global _db_unavailable

    try:
        if not _db_unavailable:
            try:
                _ensure_conversation(conversation_id, customer_phone)
                _persist_user_message(conversation_id, message_content)
            except Exception as err:
                print(f"[Agent] DB unavailable: {err}")
                _db_unavailable = True

        history = [] if _db_unavailable else get_conversation_history(conversation_id)
        intent = detect_intent(message_content, history)
        print(f"[Agent] Intent: {intent} | Message: \"{message_content[:60]}\"")

        if intent == "GREETING":
            response = _respond(MENU_TEXT)
        elif intent == "MARKET_OVERVIEW":
            response = _handle_market_overview(message_content)
        elif intent == "COMPETITIVE":
            response = _handle_competitive(message_content)
        elif intent == "BEST_WINDOW":
            response = _handle_best_window(message_content)
        elif intent == "HUB_RANKING":
            response = _handle_hub_ranking(message_content)
        else:
            response = _handle_custom_search(conversation_id, customer_phone, message_content, history)

        # Persist assistant reply so next detectIntent sees the menu state
        if not _db_unavailable and response.get("human_message"):
            try:
                query(
                    "INSERT INTO messages (conversation_id, role, content) VALUES (%s, 'assistant', %s)",
                    (conversation_id, response["human_message"]),
                )
            except Exception as err:
                print(f"[Agent] Failed to persist assistant message: {err}")

        return response

    except Exception as err:
        print(f"[Agent] Unhandled error: {err}")
        return _respond("⚠️ Ocorreu um erro ao processar sua solicitação. Tente novamente.")


# ── Intent Detection ──────────────────────────────────────────

def detect_intent(text: str, history: list) -> str:
    lower = text.lower().strip()

    # If last bot message was the menu → route by number
    last_bot = next((m for m in reversed(history) if m.get("role") == "assistant"), None)
    menu_active = last_bot and "1️⃣" in (last_bot.get("content") or "")

    if menu_active:
        if re.match(r"^1$|^1️⃣", lower):  return "MARKET_OVERVIEW"
        if re.match(r"^2$|^2️⃣", lower):  return "COMPETITIVE"
        if re.match(r"^3$|^3️⃣", lower):  return "BEST_WINDOW"
        if re.match(r"^4$|^4️⃣", lower):  return "HUB_RANKING"
        if re.match(r"^5$|^5️⃣", lower):  return "CUSTOM"

    # Direct keywords
    if _has(lower, ["concorrentes", "competidores", "radar competitivo", "comparar", " vs ", "versus"]):
        return "COMPETITIVE"
    if _has(lower, ["melhor janela", "janela", "quando captar", "captação", "captacao", "melhores dias", "calendário", "calendario"]):
        return "BEST_WINDOW"
    if _has(lower, ["ranking", "mais barato", "menor preço", "mais em conta", "mais econômico"]):
        return "HUB_RANKING"
    if _has(lower, ["mercado hoje", "mercado", "todos os hubs", "fortaleza hoje"]):
        return "MARKET_OVERVIEW"

    # Simple greeting → show menu
    words = lower.split()
    greetings = {"oi", "olá", "ola", "menu", "ajuda", "help", "start", "início", "inicio", "hi", "hey", "bom dia", "boa tarde", "boa noite"}
    if len(words) <= 3 and (lower in greetings or (words and words[0] in greetings)):
        return "GREETING"

    # IATA or flight keywords → custom search
    if _has(lower, ["voo", "voos", "passagem", "passagens", "aérea", "aereo", "flight", "for", "gru", "gig", "bsb", "fortaleza"]):
        return "CUSTOM"

    return "GREETING"


# ── 1. MARKET OVERVIEW — all hubs → FOR ──────────────────────

def _handle_market_overview(message_content: str) -> dict:
    target_date = _extract_date(message_content) or _get_next_friday()
    date_label = _format_date_label(target_date)

    lines = [
        f"✈️ *MERCADO — {OUR_DESTINATION} — {date_label}*",
        f"📍 Buscando {len(HUBS)} hubs simultaneamente...",
        "────────────────────────",
    ]

    def _search_hub(hub: str) -> dict:
        try:
            res = search_flights(hub, OUR_DESTINATION, target_date)
            price = (res.get("cheapest_flight") or {}).get("price") or (res.get("best_flight") or {}).get("price")
            opp = analyze_sales_opportunity(res.get("best_flight"), res.get("cheapest_flight"), OUR_DESTINATION, [])
            return {"origin": hub, "price": price, "level": opp["opportunity_level"], "error": None}
        except Exception as err:
            return {"origin": hub, "price": None, "level": "unknown", "error": str(err)}

    with ThreadPoolExecutor(max_workers=len(HUBS)) as ex:
        futures = {hub: ex.submit(_search_hub, hub) for hub in HUBS}
        results = [futures[hub].result() for hub in HUBS]

    valid = sorted([r for r in results if r["price"]], key=lambda r: r["price"])
    failed = [r for r in results if not r["price"]]

    if not valid:
        return _respond("⚠️ Nenhum resultado encontrado para essa data. Tente outra data.")

    lines += ["", "🏆 *RANKING POR PREÇO*"]
    medals = ["🥇", "🥈", "🥉"]
    for i, r in enumerate(valid):
        pos = medals[i] if i < 3 else f"{i + 1}."
        lines.append(f"{pos} *{r['origin']}* → {_fmt(r['price'])}  {_badge(r['level'])}")

    if failed:
        lines += ["", f"⚠️ Sem resultado: {', '.join(r['origin'] for r in failed)}"]

    ai = insight_market_overview(valid, OUR_DESTINATION, date_label)
    if ai:
        lines += ["", "🤖 *ANÁLISE IA*", ai]
    else:
        best = valid[0]
        lines += [
            "", "💡 *ESTRATÉGIA*",
            f" • Hub prioritário: {best['origin']} (R${best['price']})",
            _level_strategy(best["level"]),
        ]

    return _respond("\n".join(lines))


# ── 2. COMPETITIVE — FOR vs competitors ──────────────────────

def _handle_competitive(message_content: str) -> dict:
    target_date = _extract_date(message_content) or _get_next_friday()
    date_label = _format_date_label(target_date)
    origin = _extract_iata_code(message_content, HUBS) or "GRU"

    lines = [
        f"📡 *RADAR COMPETITIVO — {origin} — {date_label}*",
        "────────────────────────",
    ]

    res = search_competitors(origin, target_date)
    our = res["our"]
    competitors = res["competitors"]
    our_price = (our or {}).get("price")

    lines += ["", "🏠 *NOSSO DESTINO*"]
    lines.append(f"✅ Fortaleza/Ceará — {_fmt(our_price)}" if our_price else "❌ Fortaleza — sem resultado")

    lines += ["", "🎯 *DESTINOS CONCORRENTES*"]

    with_price = sorted([c for c in competitors if c.get("price")], key=lambda c: c["price"])
    no_result = [c for c in competitors if not c.get("price")]

    for c in with_price:
        diff = (c["price"] - our_price) if our_price else None
        diff_str = (f" (+{_fmt(diff)})" if diff > 0 else f" ({_fmt(diff)})") if diff is not None else ""
        icon = "⚠️" if diff is not None and diff < 0 else "✅"
        lines.append(f"{icon} {c['name']} — {_fmt(c['price'])}{diff_str}")

    if no_result:
        lines.append(f"⚪ Sem dado: {', '.join(c['name'] for c in no_result)}")

    if our_price:
        cheaper = [c for c in with_price if c["price"] < our_price]
        lines += ["", "📊 *POSICIONAMENTO*"]
        if not cheaper:
            lines.append("✅ Fortaleza é o destino mais acessível. Oportunidade de captação alta.")
        else:
            lines.append(f"⚠️ {len(cheaper)} destino(s) com voo mais barato que Fortaleza nessa data.")

    ai = insight_competitive(our, with_price, origin, date_label)
    if ai:
        lines += ["", "🤖 *ANÁLISE IA*", ai]

    return _respond("\n".join(lines))


# ── 3. BEST WINDOW — next 14 days ────────────────────────────

def _handle_best_window(message_content: str) -> dict:
    origin = _extract_iata_code(message_content, HUBS) or "GRU"

    lines = [
        "📅 *MELHOR JANELA DE CAPTAÇÃO*",
        f"🛫 Hub: *{origin}* → Fortaleza",
        "📆 Próximas 2 semanas",
        "────────────────────────",
        "🔍 Buscando preços para os próximos 14 dias...",
    ]

    today = date.today()
    dates = [
        {
            "iso": (today + timedelta(days=i + 1)).isoformat(),
            "label": _format_date_label((today + timedelta(days=i + 1)).isoformat()),
        }
        for i in range(14)
    ]

    def _search_date(d: dict) -> dict:
        try:
            res = search_flights(origin, OUR_DESTINATION, d["iso"])
            price = (res.get("cheapest_flight") or {}).get("price") or (res.get("best_flight") or {}).get("price")
            opp = analyze_sales_opportunity(res.get("best_flight"), res.get("cheapest_flight"), OUR_DESTINATION, [])
            return {"date": d["iso"], "date_label": d["label"], "price": price, "level": opp["opportunity_level"]}
        except Exception:
            return {"date": d["iso"], "date_label": d["label"], "price": None, "level": "unknown"}

    with ThreadPoolExecutor(max_workers=10) as ex:
        windows = list(ex.map(_search_date, dates))

    valid = sorted([w for w in windows if w["price"]], key=lambda w: w["price"])

    if not valid:
        return _respond("⚠️ Não foi possível obter preços para as próximas 2 semanas. Tente novamente.")

    # Remove "buscando" line
    lines.pop()

    lines += ["", "🏆 *TOP 5 DATAS PARA CAPTAÇÃO*"]
    medals = ["🥇", "🥈", "🥉"]
    for i, w in enumerate(valid[:5]):
        pos = medals[i] if i < 3 else f"{i + 1}."
        lines.append(f"{pos} {w['date_label']} — {_fmt(w['price'])}  {_badge(w['level'])}")

    high_count = sum(1 for w in valid if w["level"] == "high")
    med_count = sum(1 for w in valid if w["level"] == "medium")
    low_count = len(valid) - high_count - med_count

    lines += [
        "", "📊 *RESUMO DA JANELA*",
        f"🟢 Alta oportunidade: {high_count} dia(s)",
        f"🟡 Média: {med_count} dia(s)",
        f"🔴 Baixa: {low_count} dia(s)",
    ]

    ai = insight_best_window(valid, origin)
    if ai:
        lines += ["", "🤖 *ANÁLISE IA*", ai]
    elif valid:
        lines += ["", f"💡 Melhor data: *{valid[0]['date_label']}* ({_fmt(valid[0]['price'])})"]

    return _respond("\n".join(lines))


# ── 4. HUB RANKING — all hubs, single date ───────────────────

def _handle_hub_ranking(message_content: str) -> dict:
    target_date = _extract_date(message_content) or _get_next_friday()
    date_label = _format_date_label(target_date)

    lines = [
        f"🏅 *RANKING DE HUBS — {OUR_DESTINATION} — {date_label}*",
        "────────────────────────",
    ]

    def _search_hub(hub: str) -> dict:
        try:
            res = search_flights(hub, OUR_DESTINATION, target_date)
            price = (res.get("cheapest_flight") or {}).get("price") or (res.get("best_flight") or {}).get("price")
            opp = analyze_sales_opportunity(res.get("best_flight"), res.get("cheapest_flight"), OUR_DESTINATION, [])
            return {"origin": hub, "price": price, "level": opp["opportunity_level"]}
        except Exception:
            return {"origin": hub, "price": None, "level": "unknown"}

    with ThreadPoolExecutor(max_workers=len(HUBS)) as ex:
        results = list(ex.map(_search_hub, HUBS))

    sorted_results = sorted([r for r in results if r["price"]], key=lambda r: r["price"])
    no_result = [r for r in results if not r["price"]]

    medals = ["🥇", "🥈", "🥉"]
    for i, r in enumerate(sorted_results):
        pos = medals[i] if i < 3 else f"{i + 1}°"
        lines.append(f"{pos} *{r['origin']}* — {_fmt(r['price'])}  {_badge(r['level'])}")

    if no_result:
        lines.append(f"⚪ Sem resultado: {', '.join(r['origin'] for r in no_result)}")

    if sorted_results:
        lines += ["", f"💡 Priorize clientes de *{sorted_results[0]['origin']}* — melhor custo de deslocamento."]

    return _respond("\n".join(lines))


# ── 5. CUSTOM — free-form flight search ──────────────────────

def _handle_custom_search(
    conversation_id: str,
    customer_phone: str,
    message_content: str,
    history: list,
) -> dict:
    current_params = _extract_flight_params(message_content)
    context_text = " ".join(m.get("content", "") for m in history)
    context_params = _extract_flight_params(context_text)

    HUB_KEYWORDS = ["HUBS", "PRINCIPAIS", "TODOS", "CAPITAIS", "BRASIL"]
    is_multi_hub = any(kw in message_content.upper() for kw in HUB_KEYWORDS)

    search_params = {
        "origin": current_params["origin"] or context_params["origin"],
        "destination": current_params["destination"] or context_params["destination"],
        "departure_date": current_params["departure_date"] or context_params["departure_date"],
        "return_date": current_params["return_date"],
    }

    if is_multi_hub and current_params["origin"] and not current_params["destination"]:
        search_params["destination"] = current_params["origin"]
        search_params["origin"] = None

    if not search_params["destination"] and context_params["destination"]:
        search_params["destination"] = context_params["destination"]

    origins = HUBS if is_multi_hub else ([search_params["origin"]] if search_params["origin"] else [])

    if not origins or not search_params["destination"] or not search_params["departure_date"]:
        missing = []
        if not origins:
            missing.append('origem (ex: GRU ou "todos os hubs")')
        if not search_params["destination"]:
            missing.append("destino (ex: FOR)")
        if not search_params["departure_date"]:
            missing.append("data de ida (ex: 20/04/2026)")

        bullet_list = "\n".join(f"  • {f}" for f in missing)
        return _respond(
            f"✈️ Para a busca específica, preciso de:\n\n{bullet_list}\n\n"
            "Ou envie *menu* para ver todas as opções."
        )

    def _search_origin(origin: str) -> dict:
        try:
            flight_results = search_flights(
                origin=origin,
                destination=search_params["destination"],
                departure_date=search_params["departure_date"],
                return_date=search_params.get("return_date"),
            )
            historical = [] if _db_unavailable else get_recent_searches(origin, search_params["destination"])
            opportunity = analyze_sales_opportunity(
                flight_results.get("best_flight"),
                flight_results.get("cheapest_flight"),
                search_params["destination"],
                historical,
            )
            return {"origin": origin, "flight_results": flight_results, "opportunity": opportunity}
        except Exception as err:
            return {"origin": origin, "error": str(err)}

    with ThreadPoolExecutor(max_workers=min(len(origins), 10)) as ex:
        results = list(ex.map(_search_origin, origins))

    human_text = build_human_message(
        multi_results=results,
        destination=search_params["destination"],
        departure_date=search_params["departure_date"],
        return_date=search_params.get("return_date"),
    )

    if not _db_unavailable:
        try:
            best = next(
                (r for r in results if not r.get("error") and r.get("opportunity", {}).get("opportunity_level") == "high"),
                results[0] if results else None,
            )
            if best and not best.get("error"):
                persist_transaction(
                    conversation_id=conversation_id,
                    customer_phone=customer_phone,
                    search_params={**search_params, "origin": best["origin"]},
                    best_flight=best["flight_results"].get("best_flight"),
                    cheapest_flight=best["flight_results"].get("cheapest_flight"),
                    raw_response={"results_count": len(results)},
                    sales_opportunity=best["opportunity"],
                    assistant_message=human_text,
                )
        except Exception as err:
            print(f"[Agent] Persistence failed: {err}")

    all_opps = [r.get("opportunity", {}).get("opportunity_level") for r in results if not r.get("error")]
    top_level = "high" if "high" in all_opps else "medium"
    all_suggestions = [s for r in results if not r.get("error") for s in (r.get("opportunity", {}).get("suggestions") or [])]

    return format_response(
        text=human_text,
        opportunity_level=top_level,
        suggestions=all_suggestions[:5],
        price_analysis={"multi_hub": len(origins) > 1, "total_searches": len(results)},
        search_params=search_params,
    )


# ── Date Utilities ────────────────────────────────────────────

def _get_next_friday() -> str:
    today = date.today()
    days_until = (4 - today.weekday()) % 7 or 7  # weekday 4 = Friday
    return (today + timedelta(days=days_until)).isoformat()


def _extract_date(text: str) -> str | None:
    # ISO format
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if m:
        return m.group(1)

    # BR format dd/mm/yyyy
    m = re.search(r"\b(\d{2})/(\d{2})/(\d{4})\b", text)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    lower = text.lower()
    if "próxima sexta" in lower or "proxima sexta" in lower:
        return _get_next_friday()

    return None


def _format_date_label(iso: str) -> str:
    year, month, day = iso.split("-")
    DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    d = date(int(year), int(month), int(day))
    return f"{DAYS[d.weekday() + 1 if d.weekday() < 6 else 0]} {day}/{month}"


# ── IATA Utilities ────────────────────────────────────────────

STOP_WORDS = {
    "THE", "AND", "ARE", "BUT", "NOT", "YOU", "CAN", "HAD", "HER", "WAS",
    "ONE", "OUR", "OUT", "HAS", "HIM", "HIS", "HOW", "ITS", "NOW", "OLD",
    "SEE", "WAY", "WHO", "DID", "LET", "SHE", "TOO", "USE", "DAD", "MOM",
    "SOU", "COM", "QUE", "POR", "UMA", "DOS", "DAS", "NOS", "IDA", "DIA",
    "VOO", "VER", "MEU", "SEM", "MAS", "FAZ", "TEM", "VOU", "SER",
    "TAM", "GOL", "AZU", "LAT",
}


def _extract_iata_code(text: str, allow_list: list) -> str | None:
    upper = text.upper()
    for code in allow_list:
        if re.search(rf"\b{code}\b", upper):
            return code
    return None


def _extract_flight_params(text: str) -> dict:
    upper = text.upper()
    codes = [c for c in (re.findall(r"\b[A-Z]{3}\b", upper) or []) if c not in STOP_WORDS]

    # City name → IATA mapping
    city_map = {
        "FORTALEZA": "FOR", "BRASILIA": "BSB", "BRASÍLIA": "BSB",
        "RIO": "GIG", "PAULO": "GRU",
    }
    m = re.search(r"PARA\s+([A-ZÀ-Ú]+)", upper)
    para_iata = None
    if m:
        para_iata = city_map.get(m.group(1))

    for city, iata in city_map.items():
        if city in upper and iata not in codes:
            codes.append(iata)

    if para_iata and para_iata in codes:
        codes.remove(para_iata)
        codes.insert(1, para_iata)

    dates = _extract_dates(text)
    unique = list(dict.fromkeys(codes))

    return {
        "origin": unique[0] if len(unique) > 0 else None,
        "destination": unique[1] if len(unique) > 1 else None,
        "departure_date": dates[0] if dates else None,
        "return_date": dates[1] if len(dates) > 1 else None,
    }


def _extract_dates(text: str) -> list[str]:
    dates = []

    for m in re.finditer(r"\b(\d{4}-\d{2}-\d{2})\b", text):
        dates.append(m.group(1))

    for m in re.finditer(r"\b(\d{2})/(\d{2})/(\d{4})\b", text):
        dates.append(f"{m.group(3)}-{m.group(2)}-{m.group(1)}")

    return dates


# ── Formatters ────────────────────────────────────────────────

def _badge(level: str) -> str:
    return {"high": "🟢 ALTA", "medium": "🟡 MÉDIA", "low": "🔴 BAIXA", "unknown": "⚪"}.get(level, "⚪")


def _level_strategy(level: str) -> str:
    return {
        "high":    " • Passagem barata = cliente disponível para upgrade. Ofereça suíte premium.",
        "medium":  " • Preço médio = acione escassez: \"poucos quartos disponíveis neste período\".",
        "low":     " • Passagem cara = ofereça crédito resort ou benefícios para amortizar o custo.",
        "unknown": " • Avalie manualmente a oportunidade.",
    }.get(level, "")


def _fmt(value) -> str:
    if value is None:
        return "N/D"
    try:
        v = float(value)
        s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"R$ {s}"
    except (TypeError, ValueError):
        return "N/D"


def _respond(text: str) -> dict:
    return format_response(text=text, opportunity_level="unknown", suggestions=[], price_analysis={}, search_params={})


# ── DB Helpers ────────────────────────────────────────────────

def _ensure_conversation(conversation_id: str, customer_phone: str) -> None:
    query(
        """
        INSERT INTO conversations (id, customer_phone, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
        """,
        (conversation_id, customer_phone),
    )


def _persist_user_message(conversation_id: str, content: str) -> None:
    query(
        "INSERT INTO messages (conversation_id, role, content) VALUES (%s, 'user', %s)",
        (conversation_id, content),
    )


def _has(text: str, keywords: list) -> bool:
    return any(kw in text for kw in keywords)
