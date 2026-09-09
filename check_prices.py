import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

import requests
import yaml

from decision import should_alert
from notifiers import send_discord, send_telegram
from parsers import extract_price
from state import load_state, save_state

ITEMS_FILE = Path("items.yaml")
STATE_FILE = Path("state.json")


def fetch_html(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; PriceWatcher/1.0)"}
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    return response.text


def format_message(name: str, price: float, url: str) -> str:
    return f"\U0001F4C9 {name} caiu para R$ {price:.2f}\n{url}"


def process_items(
    items: list,
    state: dict,
    fetch_html_fn: Callable[[str], str],
    notify_fns: list,
) -> dict:
    new_state = dict(state)

    for item in items:
        name = item["name"]
        url = item["url"]
        target_price = item.get("target_price")
        last_price: Optional[float] = state.get(url, {}).get("price")

        try:
            html = fetch_html_fn(url)
        except Exception as exc:  # noqa: BLE001 - one bad site must not stop the batch
            print(f"[WARN] Falha ao buscar '{name}' ({url}): {exc}", file=sys.stderr)
            continue

        current_price = extract_price(html)
        if current_price is None:
            print(f"[WARN] Preço não encontrado para '{name}' ({url})", file=sys.stderr)
            continue

        if should_alert(current_price, target_price, last_price):
            message = format_message(name, current_price, url)
            for notify in notify_fns:
                try:
                    notify(message)
                except Exception as exc:  # noqa: BLE001 - one bad channel must not stop the batch
                    print(f"[WARN] Falha ao notificar '{name}' via {notify!r}: {exc}", file=sys.stderr)
                    continue

        new_state[url] = {
            "price": current_price,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    return new_state


def main() -> None:
    items = yaml.safe_load(ITEMS_FILE.read_text(encoding="utf-8")) or []
    state = load_state(STATE_FILE)

    notify_fns = []
    telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if telegram_token and telegram_chat_id:
        notify_fns.append(lambda msg: send_telegram(telegram_token, telegram_chat_id, msg))
    else:
        print("[INFO] Telegram não configurado - pulando esse canal.", file=sys.stderr)

    discord_webhook = os.environ.get("DISCORD_WEBHOOK_URL")
    if discord_webhook:
        notify_fns.append(lambda msg: send_discord(discord_webhook, msg))
    else:
        print("[INFO] Discord não configurado - pulando esse canal.", file=sys.stderr)

    new_state = process_items(items, state, fetch_html, notify_fns)
    save_state(STATE_FILE, new_state)


if __name__ == "__main__":
    main()
