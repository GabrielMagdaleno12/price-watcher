# Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Pages dashboard where the user can view monitored items, see a price history chart per item, and add/remove items — replacing `items.yaml`/`state.json` with JSON files the site can read and write directly.

**Architecture:** `check_prices.py` reads `docs/data/items.json` and appends one point per item per run to `docs/data/history.json` (both committed by the existing hourly GitHub Action). A static site in `docs/` (served by GitHub Pages from branch `main`, folder `/docs`) reads those two files with `fetch()` for viewing, and writes to `docs/data/items.json` via the GitHub REST Contents API (authenticated with a user-supplied Personal Access Token kept in `localStorage`) for adding/removing items.

**Tech Stack:** Python 3.11 (stdlib `json` — no more PyYAML), pytest, vanilla HTML/CSS/JS, Chart.js 4.4.4 (via cdnjs, UMD build), GitHub REST API v3 (Contents endpoint), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-10-web-dashboard-design.md`

## Global Constraints

- No login/auth system on the site — write access is gated only by possession of a GitHub PAT (single-user personal tool).
- No editing of an existing item's fields from the UI — only add and remove.
- No backfilled history — `docs/data/history.json` grows only from points recorded after this ships; the one existing `state.json` point is carried forward as the first history point during migration (Task 2), not treated as "backfill."
- No pruning/rotation of history — unbounded growth is accepted for now.
- No build step or JS framework — plain HTML/CSS/JS files GitHub Pages can serve as-is.
- Chart library: Chart.js, pinned version `4.4.4`, loaded from `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.js`.
- GitHub repo/owner for the API calls: owner `GabrielMagdaleno12`, repo `price-watcher` (hardcoded in `app.js` — this site only ever talks to this one repo).
- PAT is stored in the browser via `localStorage` only, sent only to `api.github.com`, never written to any file in the repo.

---

### Task 1: `history.py` module (replaces `state.py`)

**Files:**
- Create: `history.py`
- Create: `tests/test_history.py`

**Interfaces:**
- Produces: `load_history(path: Path) -> dict`, `save_history(path: Path, history: dict) -> None`, `append_snapshot(history: dict, snapshot: dict) -> dict` — used by Task 3's `check_prices.py`. `history` shape: `{url: [{"price": float, "checked_at": str}, ...]}`. `snapshot` shape: `{url: {"price": float, "checked_at": str}}` (one point per url, to be appended).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_history.py`:

```python
import json

from history import append_snapshot, load_history, save_history


def test_load_history_missing_file_returns_empty_dict(tmp_path):
    result = load_history(tmp_path / "history.json")
    assert result == {}


def test_load_history_reads_existing_json(tmp_path):
    path = tmp_path / "history.json"
    path.write_text(
        json.dumps({"https://x": [{"price": 10.0, "checked_at": "t1"}]}),
        encoding="utf-8",
    )
    result = load_history(path)
    assert result == {"https://x": [{"price": 10.0, "checked_at": "t1"}]}


def test_save_history_writes_readable_json(tmp_path):
    path = tmp_path / "history.json"
    save_history(path, {"https://x": [{"price": 10.0, "checked_at": "t1"}]})
    assert json.loads(path.read_text(encoding="utf-8")) == {
        "https://x": [{"price": 10.0, "checked_at": "t1"}]
    }


def test_append_snapshot_adds_point_to_new_url():
    history = {}
    snapshot = {"https://x": {"price": 10.0, "checked_at": "t1"}}
    result = append_snapshot(history, snapshot)
    assert result == {"https://x": [{"price": 10.0, "checked_at": "t1"}]}


def test_append_snapshot_appends_to_existing_url():
    history = {"https://x": [{"price": 10.0, "checked_at": "t1"}]}
    snapshot = {"https://x": {"price": 9.0, "checked_at": "t2"}}
    result = append_snapshot(history, snapshot)
    assert result == {
        "https://x": [
            {"price": 10.0, "checked_at": "t1"},
            {"price": 9.0, "checked_at": "t2"},
        ]
    }


def test_append_snapshot_does_not_mutate_input_history():
    history = {"https://x": [{"price": 10.0, "checked_at": "t1"}]}
    snapshot = {"https://x": {"price": 9.0, "checked_at": "t2"}}
    append_snapshot(history, snapshot)
    assert history == {"https://x": [{"price": 10.0, "checked_at": "t1"}]}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_history.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'history'`

- [ ] **Step 3: Write the implementation**

Create `history.py`:

```python
import json
from pathlib import Path


def load_history(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_history(path: Path, history: dict) -> None:
    path.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")


def append_snapshot(history: dict, snapshot: dict) -> dict:
    updated = {url: list(points) for url, points in history.items()}
    for url, point in snapshot.items():
        updated.setdefault(url, []).append(point)
    return updated
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_history.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add history.py tests/test_history.py
git commit -m "Add history.py module for price history tracking"
```

---

### Task 2: Migrate data files to `docs/data/`

**Files:**
- Create: `docs/data/items.json`
- Create: `docs/data/history.json`

**Interfaces:**
- Produces: the on-disk files Task 3's `check_prices.py` will read/write, and Task 5's `app.js` will `fetch()`.

- [ ] **Step 1: Create the directory and `items.json`**

Create `docs/data/items.json`, converting the current `items.yaml` entry (drop the YAML comment header; use `null` for the omitted `target_price`):

```json
[
  {
    "name": "Volante Logitech G923 (PS5/PS4/PC)",
    "url": "https://www.kabum.com.br/produto/117284/volante-logitech-g923-para-ps5-ps4-e-pc-com-force-feedback-trueforce-pedais-responsivos-launch-control-941-000148",
    "target_price": null
  }
]
```

- [ ] **Step 2: Create `history.json`**

Create `docs/data/history.json`, carrying forward the one existing `state.json` point as the first history entry:

```json
{
  "https://www.kabum.com.br/produto/117284/volante-logitech-g923-para-ps5-ps4-e-pc-com-force-feedback-trueforce-pedais-responsivos-launch-control-941-000148": [
    {
      "price": 2399.0,
      "checked_at": "2026-09-09T02:06:07.515335+00:00"
    }
  ]
}
```

- [ ] **Step 3: Verify both files parse as valid JSON**

Run: `python -c "import json; json.load(open('docs/data/items.json')); json.load(open('docs/data/history.json')); print('ok')"`
Expected: prints `ok`

- [ ] **Step 4: Commit**

```bash
git add docs/data/items.json docs/data/history.json
git commit -m "Seed docs/data/items.json and history.json from items.yaml/state.json"
```

---

### Task 3: Rewire `check_prices.py` onto `items.json`/`history.py`, remove old data files

**Files:**
- Modify: `check_prices.py`
- Modify: `requirements.txt`
- Test: `tests/test_check_prices.py`
- Delete: `items.yaml`, `state.py`, `state.json`, `tests/test_state.py`

**Interfaces:**
- Consumes: `load_history`, `save_history`, `append_snapshot` from `history.py` (Task 1); `docs/data/items.json`, `docs/data/history.json` (Task 2).
- Produces: `compute_fresh_points(old_state: dict, new_state: dict) -> dict` — a new helper in `check_prices.py`, unit-tested here. `process_items`'s existing signature/behavior is unchanged.

- [ ] **Step 1: Write the failing test for the new helper**

Add to `tests/test_check_prices.py` (keep existing imports/tests, add this import and test):

```python
from check_prices import compute_fresh_points, format_message, process_items
```

```python
def test_compute_fresh_points_includes_only_changed_entries():
    old_state = {"https://x": {"price": 10.0, "checked_at": "t1"}}
    new_state = {
        "https://x": {"price": 10.0, "checked_at": "t1"},
        "https://y": {"price": 20.0, "checked_at": "t2"},
    }
    result = compute_fresh_points(old_state, new_state)
    assert result == {"https://y": {"price": 20.0, "checked_at": "t2"}}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_check_prices.py::test_compute_fresh_points_includes_only_changed_entries -v`
Expected: FAIL with `ImportError: cannot import name 'compute_fresh_points'`

- [ ] **Step 3: Implement `compute_fresh_points` and rewire `check_prices.py`**

Replace the top of `check_prices.py` (imports and file constants):

```python
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

import requests

from decision import should_alert
from history import append_snapshot, load_history, save_history
from notifiers import send_discord, send_telegram
from parsers import extract_price

ITEMS_FILE = Path("docs/data/items.json")
HISTORY_FILE = Path("docs/data/history.json")
```

Add `compute_fresh_points` right after `process_items` (leave `fetch_html`, `format_message`, and `process_items` themselves untouched):

```python
def compute_fresh_points(old_state: dict, new_state: dict) -> dict:
    return {url: entry for url, entry in new_state.items() if old_state.get(url) != entry}
```

Replace `main()`:

```python
def main() -> None:
    items = json.loads(ITEMS_FILE.read_text(encoding="utf-8")) or []
    history = load_history(HISTORY_FILE)
    state = {url: points[-1] for url, points in history.items() if points}

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
    fresh_points = compute_fresh_points(state, new_state)
    new_history = append_snapshot(history, fresh_points)
    save_history(HISTORY_FILE, new_history)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `python -m pytest tests/test_check_prices.py::test_compute_fresh_points_includes_only_changed_entries -v`
Expected: PASS

- [ ] **Step 5: Update `requirements.txt`**

Remove the `PyYAML` line from `requirements.txt`, leaving:

```
requests>=2.31,<3
beautifulsoup4>=4.12,<5
```

- [ ] **Step 6: Delete files superseded by the JSON data layer**

```bash
git rm items.yaml state.py state.json tests/test_state.py
```

- [ ] **Step 7: Run the full test suite**

Run: `python -m pytest -v`
Expected: PASS, all tests green (existing `process_items`/`format_message` tests unaffected, plus the new `compute_fresh_points` test; `test_state.py`'s tests are gone since `history.py` covers the same ground in `test_history.py`).

- [ ] **Step 8: Commit**

```bash
git add check_prices.py requirements.txt tests/test_check_prices.py
git commit -m "Read items.json/history.json in check_prices.py, drop items.yaml/state.py"
```

---

### Task 4: Update GitHub Actions workflow to commit `docs/data/history.json`

**Files:**
- Modify: `.github/workflows/check-prices.yml`

**Interfaces:**
- Consumes: nothing new (same job, same secrets).

- [ ] **Step 1: Update the "Commit updated state" step**

In `.github/workflows/check-prices.yml`, change:

```yaml
      - name: Commit updated state
        run: |
          git config user.name "price-watcher-bot"
          git config user.email "actions@users.noreply.github.com"
          git add state.json
          git diff --cached --quiet || git commit -m "Update price state [skip ci]"
          git push
```

to:

```yaml
      - name: Commit updated state
        run: |
          git config user.name "price-watcher-bot"
          git config user.email "actions@users.noreply.github.com"
          git add docs/data/history.json
          git diff --cached --quiet || git commit -m "Update price state [skip ci]"
          git push
```

- [ ] **Step 2: Verify the YAML is well-formed**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/check-prices.yml')); print('ok')"`
Expected: prints `ok` (PyYAML is still installed locally from the dev environment even though it's no longer a runtime dependency; if this fails because PyYAML was uninstalled from your venv, run `pip install pyyaml` just for this check, or open the file and confirm the indentation visually)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/check-prices.yml
git commit -m "Commit docs/data/history.json instead of state.json in the workflow"
```

---

### Task 5: Read-only dashboard (`docs/index.html`, `docs/style.css`, `docs/app.js`)

**Files:**
- Create: `docs/index.html`
- Create: `docs/style.css`
- Create: `docs/app.js`

**Interfaces:**
- Consumes: `docs/data/items.json`, `docs/data/history.json` (Task 2/3) via same-origin `fetch()`.
- Produces: global functions `loadData()`, `renderItems()`, `populateItemSelect()`, `renderChart(url)`, module-level `itemsCache`, `historyCache`, `chartInstance` — Task 6 extends this same file, reusing these names.

Before writing the chart code in this task, invoke the **dataviz** skill for guidance on chart form, color, and axis/tooltip conventions, and apply it to the `renderChart` implementation below (adjust colors/labels to match its guidance rather than treating the snippet below as final).

- [ ] **Step 1: Create `docs/index.html`**

```html
<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Price Watcher</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Price Watcher</h1>
    <p>Itens monitorados e histórico de preço.</p>
  </header>

  <main>
    <section id="items-section">
      <h2>Itens monitorados</h2>
      <ul id="items-list"></ul>
    </section>

    <section id="chart-section">
      <h2>Histórico de preço</h2>
      <label for="item-select">Item:</label>
      <select id="item-select"></select>
      <canvas id="price-chart" height="120"></canvas>
      <p id="chart-empty" hidden>Sem dados de histórico ainda para este item.</p>
    </section>
  </main>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `docs/style.css`**

```css
:root {
  color-scheme: light dark;
  --bg: #f8fafc;
  --fg: #0f172a;
  --card-bg: #ffffff;
  --border: #e2e8f0;
  --accent: #2563eb;
  --error: #dc2626;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --fg: #e2e8f0;
    --card-bg: #1e293b;
    --border: #334155;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 24px 16px 48px;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

header, main {
  max-width: 720px;
  margin: 0 auto;
}

header { margin-bottom: 24px; }

main {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

section {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 20px;
}

h1, h2 { margin-top: 0; }

#items-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-info a {
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}

.item-info a:hover { text-decoration: underline; }

.price { font-size: 1.1rem; font-weight: 600; }
.target, .checked-at { font-size: 0.85rem; opacity: 0.75; }

.remove-btn, button[type="submit"] {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.9rem;
}

.remove-btn {
  background: transparent;
  color: var(--error);
  border: 1px solid var(--error);
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 360px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}

input {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--card-bg);
  color: var(--fg);
}

#chart-empty { opacity: 0.7; }

[role="status"] { font-size: 0.9rem; min-height: 1.2em; }
[role="status"].error { color: var(--error); }

canvas { max-width: 100%; }
```

- [ ] **Step 3: Create `docs/app.js`**

```js
const OWNER = "GabrielMagdaleno12";
const REPO = "price-watcher";
const ITEMS_PATH = "docs/data/items.json";

let itemsCache = [];
let historyCache = {};
let chartInstance = null;

async function loadData() {
  const [itemsRes, historyRes] = await Promise.all([
    fetch("data/items.json", { cache: "no-store" }),
    fetch("data/history.json", { cache: "no-store" }),
  ]);
  itemsCache = itemsRes.ok ? await itemsRes.json() : [];
  historyCache = historyRes.ok ? await historyRes.json() : {};
}

function lastPoint(url) {
  const points = historyCache[url];
  return points && points.length ? points[points.length - 1] : null;
}

function renderItems() {
  const list = document.getElementById("items-list");
  list.innerHTML = "";
  itemsCache.forEach((item) => {
    const last = lastPoint(item.url);
    const li = document.createElement("li");
    li.className = "item-card";

    const price = last ? `R$ ${last.price.toFixed(2)}` : "sem checagem ainda";
    const target = item.target_price != null ? `R$ ${item.target_price.toFixed(2)}` : "qualquer queda";
    const checkedAt = last ? new Date(last.checked_at).toLocaleString("pt-BR") : "-";

    li.innerHTML = `
      <div class="item-info">
        <a href="${item.url}" target="_blank" rel="noopener">${item.name}</a>
        <span class="price">${price}</span>
        <span class="target">alvo: ${target}</span>
        <span class="checked-at">checado em: ${checkedAt}</span>
      </div>
    `;
    list.appendChild(li);
  });
}

function populateItemSelect() {
  const select = document.getElementById("item-select");
  select.innerHTML = "";
  itemsCache.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.url;
    option.textContent = item.name;
    select.appendChild(option);
  });
}

function renderChart(url) {
  const canvas = document.getElementById("price-chart");
  const emptyMsg = document.getElementById("chart-empty");
  const points = historyCache[url] || [];

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (points.length === 0) {
    canvas.hidden = true;
    emptyMsg.hidden = false;
    return;
  }

  canvas.hidden = false;
  emptyMsg.hidden = true;

  chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((p) => new Date(p.checked_at).toLocaleString("pt-BR")),
      datasets: [{
        label: "Preço (R$)",
        data: points.map((p) => p.price),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.15)",
        tension: 0.2,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: false },
      },
    },
  });
}

async function init() {
  await loadData();
  renderItems();
  populateItemSelect();
  if (itemsCache.length > 0) {
    renderChart(itemsCache[0].url);
  }
  document.getElementById("item-select").addEventListener("change", (e) => {
    renderChart(e.target.value);
  });
}

init();
```

- [ ] **Step 4: Verify the static files are well-formed and served correctly**

Run (from the repo root):
```bash
python -m http.server 8000 --directory docs &
sleep 1
curl -s http://localhost:8000/ | grep -q "Price Watcher" && echo "index ok"
curl -s http://localhost:8000/data/items.json | grep -q "Logitech" && echo "items.json ok"
curl -s http://localhost:8000/data/history.json | grep -q "2399" && echo "history.json ok"
curl -s http://localhost:8000/app.js | grep -q "function renderChart" && echo "app.js ok"
kill %1
```
Expected: all four `... ok` lines print.

- [ ] **Step 5: Manually confirm rendering in a real browser**

Serve `docs/` locally again (`python -m http.server 8000 --directory docs`) and open `http://localhost:8000` in a browser. Confirm: the item card shows the Logitech wheel with price `R$ 2399.00` and a "checado em" timestamp, and the chart renders a single point for that item (since `history.json` currently has only one entry).

- [ ] **Step 6: Commit**

```bash
git add docs/index.html docs/style.css docs/app.js
git commit -m "Add read-only dashboard: item list and price history chart"
```

---

### Task 6: Add/remove items from the dashboard (GitHub API write flow)

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/app.js`

**Interfaces:**
- Consumes: `itemsCache`, `renderItems()`, `populateItemSelect()`, `renderChart(url)`, `chartInstance` from Task 5 (same file).
- Produces: nothing consumed by later tasks (this is the last code task).

- [ ] **Step 1: Add the add-item and token sections to `docs/index.html`**

Insert these two new `<section>` elements inside `<main>`, right after the existing `#chart-section` closing tag:

```html
    <section id="add-section">
      <h2>Adicionar item</h2>
      <form id="add-form">
        <label>Nome<input type="text" id="add-name" required></label>
        <label>URL<input type="url" id="add-url" required></label>
        <label>Preço-alvo (opcional)<input type="number" id="add-target" step="0.01" min="0"></label>
        <button type="submit">Adicionar</button>
      </form>
      <p id="add-status" role="status"></p>
    </section>

    <section id="token-section">
      <h2>Conectar ao GitHub</h2>
      <p>Necessário só para adicionar ou remover itens. <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Criar um token</a> com permissão "Contents: Read and write" neste repositório.</p>
      <form id="token-form">
        <label>Token<input type="password" id="token-input" placeholder="github_pat_..."></label>
        <button type="submit">Salvar token</button>
      </form>
      <p id="token-status" role="status"></p>
    </section>
```

- [ ] **Step 2: Add the remove button to `renderItems()` in `docs/app.js`**

Replace the `renderItems` function with:

```js
function renderItems() {
  const list = document.getElementById("items-list");
  list.innerHTML = "";
  itemsCache.forEach((item) => {
    const last = lastPoint(item.url);
    const li = document.createElement("li");
    li.className = "item-card";

    const price = last ? `R$ ${last.price.toFixed(2)}` : "sem checagem ainda";
    const target = item.target_price != null ? `R$ ${item.target_price.toFixed(2)}` : "qualquer queda";
    const checkedAt = last ? new Date(last.checked_at).toLocaleString("pt-BR") : "-";

    li.innerHTML = `
      <div class="item-info">
        <a href="${item.url}" target="_blank" rel="noopener">${item.name}</a>
        <span class="price">${price}</span>
        <span class="target">alvo: ${target}</span>
        <span class="checked-at">checado em: ${checkedAt}</span>
      </div>
      <button class="remove-btn" data-url="${item.url}">remover</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => removeItem(btn.dataset.url));
  });
}
```

- [ ] **Step 3: Add the token/base64/GitHub API helpers to `docs/app.js`**

Append these functions after `renderChart`:

```js
const TOKEN_KEY = "pw_github_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToUtf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubGetItemsFile() {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ITEMS_PATH}`,
    { headers: { Authorization: `Bearer ${getToken()}` } }
  );
  if (!response.ok) {
    throw new Error(`GitHub API retornou ${response.status} ao ler items.json`);
  }
  const data = await response.json();
  const items = JSON.parse(base64ToUtf8(data.content));
  return { items, sha: data.sha };
}

async function githubPutItemsFile(items, sha, message) {
  const content = utf8ToBase64(JSON.stringify(items, null, 2));
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ITEMS_PATH}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, content, sha, branch: "main" }),
    }
  );
  if (!response.ok) {
    const error = new Error(`GitHub API retornou ${response.status} ao gravar items.json`);
    error.status = response.status;
    throw error;
  }
}

function setStatus(elementId, text, isError) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.classList.toggle("error", Boolean(isError));
}
```

- [ ] **Step 4: Add `addItem`, `removeItem`, and `handleTokenSubmit` to `docs/app.js`**

Append after the helpers from Step 3:

```js
async function addItem(event) {
  event.preventDefault();
  if (!getToken()) {
    setStatus("add-status", "Cole seu token do GitHub na seção abaixo antes de adicionar.", true);
    return;
  }

  const name = document.getElementById("add-name").value.trim();
  const url = document.getElementById("add-url").value.trim();
  const targetRaw = document.getElementById("add-target").value.trim();
  const target_price = targetRaw === "" ? null : Number(targetRaw);

  setStatus("add-status", "Adicionando...", false);
  try {
    const { items, sha } = await githubGetItemsFile();
    items.push({ name, url, target_price });
    await githubPutItemsFile(items, sha, `Add item: ${name}`);
    itemsCache = items;
    renderItems();
    populateItemSelect();
    document.getElementById("add-form").reset();
    setStatus("add-status", "Item adicionado. O gráfico populará após a próxima checagem.", false);
  } catch (err) {
    if (err.status === 409) {
      setStatus("add-status", "Algo mudou no repositório enquanto você editava. Recarregando a lista, tente de novo.", true);
      await loadData();
      renderItems();
      populateItemSelect();
      return;
    }
    setStatus("add-status", err.message, true);
  }
}

async function removeItem(url) {
  if (!getToken()) {
    setStatus("add-status", "Cole seu token do GitHub na seção abaixo antes de remover.", true);
    return;
  }
  if (!confirm("Remover este item da lista de monitoramento?")) {
    return;
  }

  try {
    const { items, sha } = await githubGetItemsFile();
    const remaining = items.filter((item) => item.url !== url);
    await githubPutItemsFile(remaining, sha, `Remove item: ${url}`);
    itemsCache = remaining;
    renderItems();
    populateItemSelect();
    if (itemsCache.length > 0) {
      renderChart(itemsCache[0].url);
    } else if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  } catch (err) {
    if (err.status === 409) {
      setStatus("add-status", "Algo mudou no repositório enquanto você editava. Recarregando a lista, tente de novo.", true);
      await loadData();
      renderItems();
      populateItemSelect();
      return;
    }
    setStatus("add-status", err.message, true);
  }
}

function handleTokenSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("token-input");
  setToken(input.value.trim());
  input.value = "";
  setStatus("token-status", "Token salvo neste navegador.", false);
}
```

- [ ] **Step 5: Wire the new forms in `init()`**

Replace `init()` with:

```js
async function init() {
  await loadData();
  renderItems();
  populateItemSelect();
  if (itemsCache.length > 0) {
    renderChart(itemsCache[0].url);
  }
  document.getElementById("item-select").addEventListener("change", (e) => {
    renderChart(e.target.value);
  });
  document.getElementById("add-form").addEventListener("submit", addItem);
  document.getElementById("token-form").addEventListener("submit", handleTokenSubmit);
}
```

- [ ] **Step 6: Verify static serving still works and the new markup is present**

```bash
python -m http.server 8000 --directory docs &
sleep 1
curl -s http://localhost:8000/ | grep -q "id=\"add-form\"" && echo "add form present"
curl -s http://localhost:8000/ | grep -q "id=\"token-form\"" && echo "token form present"
curl -s http://localhost:8000/app.js | grep -q "async function addItem" && echo "addItem present"
curl -s http://localhost:8000/app.js | grep -q "async function removeItem" && echo "removeItem present"
kill %1
```
Expected: all four lines print.

- [ ] **Step 7: Manual end-to-end verification (requires a real PAT — do this after deploying to GitHub Pages, not against localhost, since the API writes to the real repo)**

1. Push this branch and merge to `main` so GitHub Pages picks it up (or verify Pages is already configured per Task 7's README instructions).
2. Open the published Pages URL. Confirm the "Conectar ao GitHub" section is visible.
3. Create a fine-grained PAT scoped to this repo with "Contents: Read and write", paste it into the token form, submit.
4. Add a test item through the form. Confirm it appears in the list immediately, and confirm `docs/data/items.json` in the GitHub repo now contains it (check via the GitHub web UI).
5. Remove the test item via its "remover" button (confirm the browser's native confirm dialog). Confirm it disappears from the list and from `docs/data/items.json` in the repo.

- [ ] **Step 8: Commit**

```bash
git add docs/index.html docs/app.js
git commit -m "Add add/remove item support via GitHub Contents API"
```

---

### Task 7: Update `README.md`

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Replace the "Uso" section and add a "Dashboard" section**

Replace the current `## Uso` section (which tells the user to hand-edit `items.yaml`) with:

```markdown
## Dashboard

Acesse `https://gabrielmagdaleno12.github.io/price-watcher/` para ver os
itens monitorados, o histórico de preço em gráfico, e adicionar ou remover
itens.

Para adicionar/remover pelo site você precisa de um token do GitHub:
1. Crie um [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
   com acesso restrito a este repositório e permissão **Contents: Read and
   write**.
2. Cole o token na seção "Conectar ao GitHub" do site (fica salvo só no seu
   navegador).

Também é possível editar `docs/data/items.json` diretamente pelo GitHub
(cada item tem `name`, `url` e `target_price`, que pode ser `null`).

### Habilitar o GitHub Pages (uma vez só)

Settings → Pages → Source: "Deploy from a branch" → branch `main`, pasta
`/docs`.
```

- [ ] **Step 2: Update the intro/config section to mention the new setup step**

In the numbered "Configuração (uma vez só)" list near the top of `README.md`, add a 4th item after the existing three (Telegram/Discord/Secrets):

```markdown
4. **GitHub Pages**: veja a seção "Habilitar o GitHub Pages" abaixo do
   "Dashboard".
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the web dashboard in the README"
```
