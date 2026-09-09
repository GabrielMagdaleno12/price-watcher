# Price Watcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python script + GitHub Actions workflow that checks tracked product prices and sends a Telegram/Discord alert when a price drops or hits a target.

**Architecture:** Small set of pure, independently-testable modules (`state.py`, `decision.py`, `parsers.py`, `notifiers.py`) composed by an orchestration module (`check_prices.py`). Price extraction reads schema.org `Product`/`Offer` JSON-LD structured data embedded in the page HTML — most Brazilian e-commerce platforms (VTEX, Shopify, WooCommerce-based stores) emit this, so one parser covers multiple stores instead of a brittle per-site CSS selector. A GitHub Actions workflow runs the script on a schedule and commits `state.json` back to the repo.

**Tech Stack:** Python 3.11, `requests`, `beautifulsoup4`, `PyYAML`, `pytest`. No web framework, no database.

**Spec:** `docs/superpowers/specs/2026-09-08-price-watcher-design.md`

## Global Constraints

- Python 3.11+, dependencies limited to `requests`, `beautifulsoup4`, `PyYAML` (+ `pytest` for dev/test only) — no other third-party packages.
- Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`) are read only from environment variables — never written to any file in the repo.
- User-facing alert text is in Portuguese (matches the user's own language for this project).
- Every module is plain functions (no classes) — this is a small script, not a framework.
- Tests use `unittest.mock` for HTTP calls — no live network access in the test suite.

---

### Task 1: Project scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `requirements-dev.txt`
- Create: `pytest.ini`
- Create: `.gitignore`
- Create: `items.yaml`

**Interfaces:**
- Produces: `items.yaml` schema — a YAML list of `{name: str, url: str, target_price: float (optional)}`, read by Task 6.

- [ ] **Step 1: Create `requirements.txt`**

```
requests>=2.31,<3
beautifulsoup4>=4.12,<5
PyYAML>=6.0,<7
```

- [ ] **Step 2: Create `requirements-dev.txt`**

```
-r requirements.txt
pytest>=8.0,<9
```

- [ ] **Step 3: Create `pytest.ini`**

```ini
[pytest]
pythonpath = .
```

- [ ] **Step 4: Create `.gitignore`**

```
__pycache__/
*.pyc
.venv/
venv/
```

- [ ] **Step 5: Create sample `items.yaml`**

```yaml
# Adicione um item por bloco. "target_price" é opcional — se omitido,
# você recebe alerta em QUALQUER queda de preço em relação à última checagem.
- name: "Exemplo - remova este item"
  url: "https://www.kabum.com.br/produto/000000"
  target_price: 999.90
```

- [ ] **Step 6: Verify pytest runs with no tests collected**

Run: `python -m pytest`
Expected: `no tests ran` (exit code 5) — confirms `pytest.ini` and Python setup work before any test files exist.

- [ ] **Step 7: Commit**

```bash
git add requirements.txt requirements-dev.txt pytest.ini .gitignore items.yaml
git commit -m "Add project scaffolding"
```

---

### Task 2: State persistence (`state.py`)

**Files:**
- Create: `state.py`
- Test: `tests/test_state.py`

**Interfaces:**
- Produces: `load_state(path: pathlib.Path) -> dict`, `save_state(path: pathlib.Path, state: dict) -> None`. Consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_state.py
import json
from state import load_state, save_state


def test_load_state_missing_file_returns_empty_dict(tmp_path):
    result = load_state(tmp_path / "state.json")
    assert result == {}


def test_load_state_reads_existing_json(tmp_path):
    path = tmp_path / "state.json"
    path.write_text(json.dumps({"https://x": {"price": 10.0}}), encoding="utf-8")
    result = load_state(path)
    assert result == {"https://x": {"price": 10.0}}


def test_save_state_writes_readable_json(tmp_path):
    path = tmp_path / "state.json"
    save_state(path, {"https://x": {"price": 10.0}})
    assert json.loads(path.read_text(encoding="utf-8")) == {"https://x": {"price": 10.0}}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_state.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'state'`

- [ ] **Step 3: Write minimal implementation**

```python
# state.py
import json
from pathlib import Path


def load_state(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(path: Path, state: dict) -> None:
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_state.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add state.py tests/test_state.py
git commit -m "Add state persistence module"
```

---

### Task 3: Alert decision logic (`decision.py`)

**Files:**
- Create: `decision.py`
- Test: `tests/test_decision.py`

**Interfaces:**
- Produces: `should_alert(current_price: float, target_price: float | None, last_price: float | None) -> bool`. Consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_decision.py
from decision import should_alert


def test_alerts_when_at_or_below_target_price():
    assert should_alert(current_price=500.0, target_price=500.0, last_price=None) is True
    assert should_alert(current_price=499.0, target_price=500.0, last_price=None) is True


def test_no_alert_when_above_target_price():
    assert should_alert(current_price=501.0, target_price=500.0, last_price=600.0) is False


def test_alerts_on_any_drop_when_no_target_set():
    assert should_alert(current_price=90.0, target_price=None, last_price=100.0) is True


def test_no_alert_when_price_unchanged_or_up_and_no_target():
    assert should_alert(current_price=100.0, target_price=None, last_price=100.0) is False
    assert should_alert(current_price=110.0, target_price=None, last_price=100.0) is False


def test_no_alert_on_first_check_with_no_target():
    assert should_alert(current_price=100.0, target_price=None, last_price=None) is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_decision.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'decision'`

- [ ] **Step 3: Write minimal implementation**

```python
# decision.py
from typing import Optional


def should_alert(current_price: float, target_price: Optional[float], last_price: Optional[float]) -> bool:
    if target_price is not None:
        return current_price <= target_price
    if last_price is not None:
        return current_price < last_price
    return False
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_decision.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add decision.py tests/test_decision.py
git commit -m "Add alert decision logic"
```

---

### Task 4: Price extraction (`parsers.py`)

**Files:**
- Create: `parsers.py`
- Test: `tests/test_parsers.py`

**Interfaces:**
- Produces: `extract_price(html: str) -> float | None`. Consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_parsers.py
from parsers import extract_price

HTML_WITH_OFFER_DICT = """
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Product","name":"Tenis X",
 "offers":{"@type":"Offer","price":"599.90","priceCurrency":"BRL"}}
</script>
</head><body></body></html>
"""

HTML_WITH_OFFERS_LIST = """
<html><head>
<script type="application/ld+json">
{"@type":"Product","offers":[{"@type":"Offer","price":"1234.5"}]}
</script>
</head></html>
"""

HTML_WITH_MALFORMED_JSON_THEN_VALID = """
<html><head>
<script type="application/ld+json">{not valid json</script>
<script type="application/ld+json">
{"@type":"Product","offers":{"price": 42.0}}
</script>
</head></html>
"""

HTML_WITHOUT_JSONLD = "<html><body><span class='price'>R$ 10,00</span></body></html>"


def test_extracts_price_from_offer_dict():
    assert extract_price(HTML_WITH_OFFER_DICT) == 599.90


def test_extracts_price_from_offers_list():
    assert extract_price(HTML_WITH_OFFERS_LIST) == 1234.5


def test_skips_malformed_jsonld_and_uses_next_script():
    assert extract_price(HTML_WITH_MALFORMED_JSON_THEN_VALID) == 42.0


def test_returns_none_when_no_structured_price_found():
    assert extract_price(HTML_WITHOUT_JSONLD) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_parsers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'parsers'`

- [ ] **Step 3: Write minimal implementation**

```python
# parsers.py
import json
from typing import Optional
from bs4 import BeautifulSoup


def _to_float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _find_price_in_jsonld(data) -> Optional[float]:
    if isinstance(data, list):
        for item in data:
            price = _find_price_in_jsonld(item)
            if price is not None:
                return price
        return None
    if isinstance(data, dict):
        offers = data.get("offers")
        if isinstance(offers, dict) and "price" in offers:
            return _to_float(offers["price"])
        if isinstance(offers, list):
            for offer in offers:
                if isinstance(offer, dict) and "price" in offer:
                    return _to_float(offer["price"])
        if "price" in data:
            return _to_float(data["price"])
    return None


def extract_price(html: str) -> Optional[float]:
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except ValueError:
            continue
        price = _find_price_in_jsonld(data)
        if price is not None:
            return price
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_parsers.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add parsers.py tests/test_parsers.py
git commit -m "Add JSON-LD price extraction"
```

---

### Task 5: Notification senders (`notifiers.py`)

**Files:**
- Create: `notifiers.py`
- Test: `tests/test_notifiers.py`

**Interfaces:**
- Produces: `send_telegram(token: str, chat_id: str, message: str) -> bool`, `send_discord(webhook_url: str, message: str) -> bool`. Consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_notifiers.py
from unittest.mock import patch, Mock
from notifiers import send_telegram, send_discord


@patch("notifiers.requests.post")
def test_send_telegram_posts_to_bot_api_and_returns_true_on_success(mock_post):
    mock_post.return_value = Mock(ok=True)

    result = send_telegram("TOKEN", "CHAT_ID", "preço caiu")

    assert result is True
    args, kwargs = mock_post.call_args
    assert args[0] == "https://api.telegram.org/botTOKEN/sendMessage"
    assert kwargs["json"] == {"chat_id": "CHAT_ID", "text": "preço caiu"}


@patch("notifiers.requests.post")
def test_send_telegram_returns_false_on_failure(mock_post):
    mock_post.return_value = Mock(ok=False)
    assert send_telegram("TOKEN", "CHAT_ID", "msg") is False


@patch("notifiers.requests.post")
def test_send_discord_posts_to_webhook_url(mock_post):
    mock_post.return_value = Mock(ok=True)

    result = send_discord("https://discord.com/api/webhooks/x/y", "preço caiu")

    assert result is True
    args, kwargs = mock_post.call_args
    assert args[0] == "https://discord.com/api/webhooks/x/y"
    assert kwargs["json"] == {"content": "preço caiu"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_notifiers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'notifiers'`

- [ ] **Step 3: Write minimal implementation**

```python
# notifiers.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_notifiers.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add notifiers.py tests/test_notifiers.py
git commit -m "Add Telegram and Discord notifiers"
```

---

### Task 6: Orchestration (`check_prices.py`)

**Files:**
- Create: `check_prices.py`
- Test: `tests/test_check_prices.py`

**Interfaces:**
- Consumes: `load_state`/`save_state` from `state.py`; `should_alert` from `decision.py`; `extract_price` from `parsers.py`; `send_telegram`/`send_discord` from `notifiers.py`.
- Produces: `format_message(name: str, price: float, url: str) -> str`, `process_items(items: list[dict], state: dict, fetch_html_fn: Callable[[str], str], notify_fns: list[Callable[[str], None]]) -> dict` (returns the new state), and a `main()` entrypoint wiring real files/env/network.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_check_prices.py
from check_prices import format_message, process_items

HTML_599 = """<script type="application/ld+json">
{"@type":"Product","offers":{"price":599.90}}</script>"""

HTML_450 = """<script type="application/ld+json">
{"@type":"Product","offers":{"price":450.0}}</script>"""


def test_format_message_includes_name_price_and_link():
    message = format_message("Tenis X", 599.9, "https://loja.com/x")
    assert "Tenis X" in message
    assert "599.90" in message
    assert "https://loja.com/x" in message


def test_process_items_alerts_when_target_price_hit():
    items = [{"name": "Tenis X", "url": "https://loja.com/x", "target_price": 600.0}]
    sent = []

    new_state = process_items(
        items,
        state={},
        fetch_html_fn=lambda url: HTML_599,
        notify_fns=[sent.append],
    )

    assert len(sent) == 1
    assert "Tenis X" in sent[0]
    assert new_state["https://loja.com/x"]["price"] == 599.90


def test_process_items_no_alert_when_above_target():
    items = [{"name": "Tenis X", "url": "https://loja.com/x", "target_price": 100.0}]
    sent = []

    process_items(items, state={}, fetch_html_fn=lambda url: HTML_599, notify_fns=[sent.append])

    assert sent == []


def test_process_items_alerts_on_drop_without_target():
    items = [{"name": "Tenis X", "url": "https://loja.com/x"}]
    sent = []
    previous_state = {"https://loja.com/x": {"price": 599.90}}

    new_state = process_items(
        items,
        state=previous_state,
        fetch_html_fn=lambda url: HTML_450,
        notify_fns=[sent.append],
    )

    assert len(sent) == 1
    assert new_state["https://loja.com/x"]["price"] == 450.0


def test_process_items_skips_item_when_fetch_raises():
    items = [{"name": "Tenis X", "url": "https://loja.com/x", "target_price": 999.0}]
    sent = []

    def failing_fetch(url):
        raise RuntimeError("boom")

    new_state = process_items(items, state={}, fetch_html_fn=failing_fetch, notify_fns=[sent.append])

    assert sent == []
    assert new_state == {}


def test_process_items_skips_item_when_price_not_found():
    items = [{"name": "Tenis X", "url": "https://loja.com/x", "target_price": 999.0}]
    sent = []

    new_state = process_items(
        items, state={}, fetch_html_fn=lambda url: "<html></html>", notify_fns=[sent.append]
    )

    assert sent == []
    assert new_state == {}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_check_prices.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'check_prices'`

- [ ] **Step 3: Write minimal implementation**

```python
# check_prices.py
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
                notify(message)

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_check_prices.py -v`
Expected: 6 passed

- [ ] **Step 5: Run the full test suite**

Run: `python -m pytest -v`
Expected: all tests from Tasks 2-6 pass (21 total)

- [ ] **Step 6: Commit**

```bash
git add check_prices.py tests/test_check_prices.py
git commit -m "Add orchestration script tying parsing, decision and notifications together"
```

---

### Task 7: GitHub Actions workflow + setup docs

**Files:**
- Create: `.github/workflows/check-prices.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `check_prices.py` (Task 6) as the command the workflow runs; the three secret names defined in the spec.

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/check-prices.yml
name: Check prices

on:
  schedule:
    - cron: "0 * * * *"   # a cada hora, no minuto 0 (ajuste aqui a frequência)
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run price check
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: python check_prices.py

      - name: Commit updated state
        run: |
          git config user.name "price-watcher-bot"
          git config user.email "actions@users.noreply.github.com"
          git add state.json
          git diff --cached --quiet || git commit -m "Update price state [skip ci]"
          git push
```

- [ ] **Step 2: Validate the workflow YAML parses correctly**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/check-prices.yml', encoding='utf-8'))"`
Expected: no output, exit code 0 (confirms valid YAML before it ever reaches GitHub)

- [ ] **Step 3: Write `README.md` with setup instructions**

```markdown
# Price Watcher

Monitora o preço de produtos e avisa no Telegram e Discord quando cai.

## Configuração (uma vez só)

1. **Telegram**: fale com [@BotFather](https://t.me/BotFather), crie um bot
   com `/newbot` e guarde o token. Envie uma mensagem qualquer para o bot e
   depois acesse `https://api.telegram.org/bot<TOKEN>/getUpdates` para
   pegar o seu `chat_id` (campo `message.chat.id`).
2. **Discord**: nas configurações de um canal do seu servidor, vá em
   Integrações → Webhooks → Novo Webhook, e copie a URL.
3. No repositório do GitHub, vá em **Settings → Secrets and variables →
   Actions** e adicione:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `DISCORD_WEBHOOK_URL`

## Uso

Edite `items.yaml` para adicionar ou remover produtos. Cada item tem:

```yaml
- name: "Nome do produto"
  url: "https://loja.com/produto"
  target_price: 599.90   # opcional
```

A checagem roda automaticamente pelo GitHub Actions (veja o cron em
`.github/workflows/check-prices.yml`). Para rodar manualmente e testar, vá
na aba **Actions** do repositório → **Check prices** → **Run workflow**.

## Rodando localmente (opcional, para testes)

```bash
pip install -r requirements-dev.txt
python -m pytest
```
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/check-prices.yml README.md
git commit -m "Add GitHub Actions workflow and setup instructions"
```

---

### Task 8: Push to GitHub and run a live validation

**Files:** none (operational task)

**Interfaces:** none — this task exercises Tasks 1-7 against the real remote and real websites.

- [ ] **Step 1: Push to the remote**

Confirm with the user before pushing (this publishes the repo's content to their GitHub account).

```bash
git push -u origin master
```

- [ ] **Step 2: Ask the user to add the three repo secrets**

Point them to the README's setup section (`Settings → Secrets and variables → Actions`). Do not proceed until they confirm the secrets are added — do not accept the raw token/URL values in chat.

- [ ] **Step 3: Replace the sample entry in `items.yaml` with real products**

Ask the user for at least one real product URL per store they care about (Kabum, Magazine Luiza, Mercado Livre, Amazon BR, Pichau, Terabyte), commit, and push.

- [ ] **Step 4: Run the workflow manually and inspect the result**

Trigger it from the Actions tab (`workflow_dispatch`) or via `gh workflow run check-prices.yml` if the GitHub CLI is available. Check the run log for `[WARN]` lines — any store logging "Preço não encontrado" needs a follow-up parser fix (out of scope for this plan; report back which stores failed).

- [ ] **Step 5: Confirm alert delivery**

Temporarily lower one item's `target_price` above its current price, re-run manually, and confirm a message arrives on both Telegram and Discord. Revert the test `target_price` afterward.
