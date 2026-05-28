"""Tekora Telegram sender.
Uses environment variables first, then config/telegram_config.json.
Never post your real token publicly. Rotate token before public launch.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG_FILE = ROOT / "config" / "telegram_config.json"


def load_telegram_config() -> Dict[str, str]:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()

    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            token = token or str(data.get("bot_token", "")).strip()
            chat_id = chat_id or str(data.get("chat_id", "")).strip()
        except Exception:
            pass

    if not token:
        raise RuntimeError("Missing TELEGRAM_BOT_TOKEN. Add it to GitHub Secrets or config/telegram_config.json")
    if not chat_id:
        raise RuntimeError("Missing TELEGRAM_CHAT_ID. Add it to GitHub Secrets or config/telegram_config.json")
    return {"bot_token": token, "chat_id": chat_id}


def send_telegram_message(text: str, disable_web_page_preview: bool = True) -> Dict[str, Any]:
    cfg = load_telegram_config()
    url = f"https://api.telegram.org/bot{cfg['bot_token']}/sendMessage"
    payload = {
        "chat_id": cfg["chat_id"],
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": disable_web_page_preview,
    }
    response = requests.post(url, json=payload, timeout=15)
    try:
        data = response.json()
    except Exception:
        data = {"ok": False, "raw": response.text}
    if not response.ok or not data.get("ok"):
        raise RuntimeError(f"Telegram send failed: HTTP {response.status_code} {data}")
    return data


def escape_html(value: Any) -> str:
    text = str(value)
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
