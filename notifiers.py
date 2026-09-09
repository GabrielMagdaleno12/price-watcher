import requests


def send_telegram(token: str, chat_id: str, message: str) -> bool:
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": message},
        timeout=10,
    )
    return response.ok


def send_discord(webhook_url: str, message: str) -> bool:
    response = requests.post(webhook_url, json={"content": message}, timeout=10)
    return response.ok
