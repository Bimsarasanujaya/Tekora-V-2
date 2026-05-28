"""Tekora V32 Telegram VIP scanner.
Single-run script designed for GitHub Actions cron every 5 minutes.
Flow:
1. If a trade is active, monitor it with live MEXC price and send TP/SL/status updates.
2. If no trade is active, scan the market and send only a high-score VIP signal.
"""
from __future__ import annotations
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import scan_best_setups, get_klines, update_trade_status  # noqa: E402
from telegram_bot.telegram_sender import send_telegram_message, escape_html  # noqa: E402

STATE_FILE = ROOT / "state" / "telegram_state.json"
MIN_SCORE = int(os.getenv("TEKORA_MIN_TELEGRAM_SCORE", "80"))
SCAN_UNIVERSE = os.getenv("TEKORA_SCAN_UNIVERSE", "top100")
SCAN_JOBS = [
    ("scalp", "5m"),
    ("scalp", "15m"),
    ("aggressive", "5m"),
    ("aggressive", "15m"),
]
TERMINAL_STATUSES = {"TP3 HIT", "SL HIT", "EXPIRED"}
WIN_STATUSES = {"TP1 HIT", "TP2 HIT", "TP3 HIT"}
STATUS_RANK = {
    "SIGNAL ONLY": 0,
    "WAITING ENTRY": 1,
    "RUNNING": 2,
    "TP1 HIT": 3,
    "TP2 HIT": 4,
    "TP3 HIT": 5,
    "SL HIT": 6,
    "EXPIRED": 6,
    "DATA SYNCING": 1,
}


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())


def load_state() -> Dict[str, Any]:
    if not STATE_FILE.exists():
        return {"active_trade": None, "history": [], "last_run": None}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"active_trade": None, "history": [], "last_run": None, "state_error": "reset_bad_json"}


def save_state(state: Dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    state["last_run"] = now_text()
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def fmt_price(value: Any) -> str:
    try:
        n = float(value)
        if abs(n) >= 1000:
            return f"{n:,.2f}"
        if abs(n) >= 1:
            return f"{n:,.5f}".rstrip("0").rstrip(".")
        return f"{n:.8f}".rstrip("0").rstrip(".")
    except Exception:
        return escape_html(value)


def signal_message(sig: Dict[str, Any]) -> str:
    action = escape_html(sig.get("action", "SETUP"))
    pair = escape_html(sig.get("symbol", "UNKNOWN"))
    direction = escape_html(sig.get("direction", "?"))
    entry_label = escape_html(sig.get("entry_label", "Entry"))
    entry_value = escape_html(sig.get("entry_value", sig.get("market_entry", "?")))
    reasons = sig.get("reasons") or []
    reason_lines = "\n".join(f"• {escape_html(r)}" for r in reasons[:5])
    return f"""🔥 <b>TEKORA VIP SIGNAL</b> 🔥

<b>PAIR:</b> {pair}
<b>TIMEFRAME:</b> {escape_html(sig.get('timeframe', '?'))}
<b>MODE:</b> {escape_html(sig.get('mode', '?'))}
<b>DIRECTION:</b> {direction}
<b>ACTION:</b> {action}
<b>SCORE:</b> {escape_html(sig.get('score', '?'))}/100
<b>GRADE:</b> {escape_html(sig.get('grade', '?'))}

<b>{entry_label}:</b> {entry_value}
<b>STOP LOSS:</b> {fmt_price(sig.get('stop_loss'))}
<b>TP1:</b> {fmt_price(sig.get('tp1'))}
<b>TP2:</b> {fmt_price(sig.get('tp2'))}
<b>TP3:</b> {fmt_price(sig.get('tp3'))}

🧠 <b>Tekora AI Reasoning</b>
{reason_lines}

⚠️ Risk small. Not financial advice.
🤖 Tekora will monitor this setup until close."""


def update_message(trade: Dict[str, Any], old_status: str, new_status: str) -> str:
    pair = escape_html(trade.get("symbol", "UNKNOWN"))
    direction = escape_html(trade.get("direction", "?"))
    price = fmt_price(trade.get("current_price", "?"))
    rr = escape_html(trade.get("rr", 0))
    icon = "🎯" if new_status in WIN_STATUSES else "🛑" if new_status == "SL HIT" else "✅" if new_status == "RUNNING" else "⏳"
    extra = ""
    if new_status == "TP1 HIT" and trade.get("be_moved"):
        extra = "\n🛡️ SL moved to break-even logic activated."
    if new_status in TERMINAL_STATUSES:
        extra += "\n🏁 Trade lifecycle closed. Tekora will search for the next setup on the next cycle."
    return f"""{icon} <b>TEKORA TRADE UPDATE</b>

<b>PAIR:</b> {pair}
<b>DIRECTION:</b> {direction}
<b>STATUS:</b> {escape_html(new_status)}
<b>PRICE:</b> {price}
<b>RR NOW:</b> {rr}
<b>PREVIOUS:</b> {escape_html(old_status)}{extra}"""


def pick_best_signal() -> Optional[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    for mode, timeframe in SCAN_JOBS:
        try:
            out = scan_best_setups(mode=mode, timeframe=timeframe, universe=SCAN_UNIVERSE)
            best = out.get("best") or ((out.get("results") or [None])[0])
            if best and int(best.get("score", 0)) >= MIN_SCORE and str(best.get("action", "")).upper() != "HIGH RISK":
                candidates.append(best)
        except Exception as exc:
            print(f"Scan failed for {mode} {timeframe}: {exc}")
    if not candidates:
        return None
    candidates.sort(key=lambda x: (int(x.get("score", 0)), 1 if x.get("action") == "EXECUTE NOW" else 0), reverse=True)
    return candidates[0]


def normalize_new_status(old_status: str, new_status: str) -> str:
    # Prevent noisy regression from TP1 back to RUNNING if price pulls back after partial target.
    if old_status in {"TP1 HIT", "TP2 HIT"} and new_status == "RUNNING":
        return old_status
    if old_status == "TP2 HIT" and new_status == "TP1 HIT":
        return old_status
    return new_status


def monitor_active_trade(state: Dict[str, Any]) -> Dict[str, Any]:
    trade = state.get("active_trade")
    if not trade:
        return state
    old_status = str(trade.get("status", "WAITING ENTRY"))
    try:
        last_price = get_klines(trade["symbol"], trade.get("timeframe", "15m"), 3)[-1].close
        update = update_trade_status(trade, last_price)
        trade.update(update)
        new_status = normalize_new_status(old_status, str(trade.get("status", old_status)))
        trade["status"] = new_status
        print(f"Monitoring {trade.get('symbol')} price={last_price} status={old_status}->{new_status}")
        if new_status != old_status:
            send_telegram_message(update_message(trade, old_status, new_status))
        if new_status in TERMINAL_STATUSES:
            state.setdefault("history", []).insert(0, trade)
            state["history"] = state["history"][:50]
            state["active_trade"] = None
        else:
            state["active_trade"] = trade
    except Exception as exc:
        trade["last_error"] = str(exc)
        trade["last_error_time"] = now_text()
        state["active_trade"] = trade
        print(f"Monitor error: {exc}")
    return state


def scan_and_send(state: Dict[str, Any]) -> Dict[str, Any]:
    sig = pick_best_signal()
    if not sig:
        print(f"No setup reached score >= {MIN_SCORE}. No Telegram signal sent.")
        state["last_scan_result"] = f"No setup >= {MIN_SCORE}"
        return state
    action = str(sig.get("action", "")).upper()
    initial_status = "RUNNING" if action == "EXECUTE NOW" else ("WAITING ENTRY" if action in {"LIMIT ENTRY", "WAIT FOR RETEST"} else "SIGNAL ONLY")
    sig.update({
        "status": initial_status,
        "entry_filled": initial_status == "RUNNING",
        "tracked_at": int(time.time()),
        "telegram_sent_at": now_text(),
        "timeline": [{"time": time.strftime("%H:%M:%S"), "event": "TELEGRAM SIGNAL SENT"}],
    })
    send_telegram_message(signal_message(sig))
    state["active_trade"] = sig
    state["last_scan_result"] = f"Sent {sig.get('symbol')} {sig.get('direction')} score {sig.get('score')}"
    print(state["last_scan_result"])
    return state


def main() -> None:
    state = load_state()
    if state.get("active_trade"):
        state = monitor_active_trade(state)
    else:
        state = scan_and_send(state)
    save_state(state)


if __name__ == "__main__":
    main()
