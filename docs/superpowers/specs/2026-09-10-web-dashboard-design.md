# Price Watcher — Web Dashboard — Design

## Goal

Add a website (hosted on GitHub Pages) where the user can see the items
currently being monitored, add new items, remove items, and view a price
history chart per item — without needing to hand-edit files or run anything
locally.

## Non-goals

- No authentication/login system for the site itself — it's a single-user
  personal tool; write access is gated by possession of a GitHub Personal
  Access Token (PAT), not by a login flow.
- No editing of an existing item's fields (name/url/target_price) from the
  UI — only add and remove. Editing is still done by removing and re-adding,
  or by hand-editing `docs/data/items.json`.
- No backfilled/imported price history — the chart starts empty and grows
  from the first check after this change ships.
- No pruning/rotation of `history.json` — it grows by one point per item per
  check (hourly). Acceptable for now; revisit if the file gets unwieldy.
- No build step/framework for the site — plain HTML/CSS/JS, so GitHub Pages
  can serve it directly with zero CI changes beyond what already exists.

## Architecture

```
GitHub repo (public)
├── docs/                        <- GitHub Pages root (branch: main, folder: /docs)
│   ├── index.html               <- dashboard: item list + add form + chart
│   ├── app.js
│   ├── style.css
│   ├── data/
│   │   ├── items.json           <- monitored items (replaces items.yaml)
│   │   └── history.json         <- price history per item (replaces state.json)
│   └── superpowers/             <- existing design docs, untouched, unlinked from the site
├── check_prices.py              <- reads items.json, appends to history.json
├── history.py                   <- load/save history (replaces state.py)
├── decision.py, notifiers.py, parsers.py   <- unchanged
└── .github/workflows/
    └── check-prices.yml         <- same cron/dispatch trigger; commits docs/data/history.json
```

- **Hosting**: GitHub Pages, source = branch `main`, folder `/docs`. Every
  push to `main` (including the bot's hourly history commit) redeploys the
  site automatically — no separate deploy workflow needed.
- **Reads** (viewing the list and the chart): the page does a same-origin
  `fetch()` of `data/items.json` and `data/history.json`. No auth required.
- **Writes** (add/remove item): the browser calls the GitHub REST Contents
  API directly (`GET`/`PUT /repos/{owner}/{repo}/contents/docs/data/items.json`),
  authenticated with a PAT the user pastes into the page once. The PAT is
  kept only in the browser's `localStorage` — never sent anywhere but the
  GitHub API, never committed to the repo.

## Data model

`docs/data/items.json` (replaces `items.yaml`):
```json
[
  {
    "name": "Volante Logitech G923 (PS5/PS4/PC)",
    "url": "https://www.kabum.com.br/produto/117284/...",
    "target_price": null
  }
]
```

`docs/data/history.json` (replaces `state.json`):
```json
{
  "https://www.kabum.com.br/produto/117284/...": [
    {"price": 2399.0, "checked_at": "2026-09-09T02:06:07.515335+00:00"},
    {"price": 2350.0, "checked_at": "2026-09-09T03:06:04.221001+00:00"}
  ]
}
```
The last element of each item's list is its current price/last-checked time.

## Components

1. **`check_prices.py`** — `ITEMS_FILE` becomes `docs/data/items.json`,
   loaded with `json.load` instead of `yaml.safe_load`. `process_items`'s
   signature and internal logic are unchanged (it still takes/returns a
   `{url: {"price", "checked_at"}}` snapshot). `main()` now:
   - derives that snapshot from the last entry of each item's series in
     `history.json` before calling `process_items` (for the `last_price`
     comparison `should_alert` needs),
   - after `process_items` returns the new snapshot, appends each entry to
     the corresponding item's list in the history structure and saves it.
2. **`history.py`** (replaces `state.py`) — `load_history(path) -> dict`,
   `save_history(path, history) -> None` (plain JSON load/dump, same shape
   as the file above), plus `append_snapshot(history, snapshot) -> dict`
   that appends one point per URL in the snapshot to the history dict and
   returns the updated dict.
3. **`docs/index.html` / `docs/app.js` / `docs/style.css`** — static
   dashboard:
   - Item list: name (linked to the store URL), current price, target price
     (or "any drop" if unset), a status badge, last-checked timestamp, a
     "remover" button per item.
   - "Adicionar item" form: name, url, target price (optional, blank =
     alert on any drop).
   - A `<select>` of items + one Chart.js line chart (loaded from a CDN)
     showing the selected item's price history.
   - A small "conectar GitHub" section: a password-style input for the PAT,
     saved to `localStorage` on submit; shown only around the add/remove
     controls. Reading the list/chart never requires it.
4. **`.github/workflows/check-prices.yml`** — identical structure; the
   final step's `git add state.json` becomes
   `git add docs/data/history.json`.

## Add/remove flow (client-side)

1. `GET /repos/{owner}/{repo}/contents/docs/data/items.json` (with the PAT
   in the `Authorization` header) → get current file content (base64) and
   its `sha`.
2. Decode, `JSON.parse`, push (add) or filter out (remove) the target item.
3. `JSON.stringify` the updated array, base64-encode it.
4. `PUT` the same endpoint with `{ message, content, sha, branch: "main" }`.
   This creates a commit directly on `main`, which triggers a Pages
   redeploy.
5. On success, update the in-memory list and re-render immediately (don't
   wait for the redeploy to reflect the change in the current tab).

## Error handling

- Missing/invalid PAT, or PAT without `contents:write` on this repo → the
  GitHub API returns 401/403; the UI shows an inline error near the
  add/remove form and leaves the list untouched. Viewing the list/chart
  never breaks, since that path needs no token.
- `sha` mismatch (409, e.g. two edits racing) → the UI shows "algo mudou,
  recarregue e tente de novo" and refetches the current file. Low risk in
  practice (single user).
- `docs/data/history.json` missing an entry for an item (e.g. right after
  it's added, before the next hourly check) → the chart shows "sem dados
  ainda" for that item instead of erroring.

## Testing plan

- `history.py` gets unit tests (replacing `test_state.py`): load/save
  round-trip, and `append_snapshot` appending correctly for both a new URL
  and one with existing points.
- `check_prices.py` tests updated to build items/history fixtures as JSON
  structures instead of YAML; `process_items` itself needs no test changes
  since its signature/behavior don't change.
- The static site has no automated test suite. Verify manually after
  deploy: open the published Pages URL, confirm the item list and chart
  render from the committed JSON, add a test item through the UI, confirm
  it appears in `docs/data/items.json` in the repo, then remove it the same
  way.

## One-time setup (user does this, outside of code)

1. Settings → Pages → Source: "Deploy from a branch" → `main` / `/docs`.
2. Create a fine-grained GitHub PAT scoped to just this repo, permission
   "Contents: Read and write", and paste it into the site once when adding
   or removing an item for the first time.

## Rejected alternatives

- **Local Flask/backend app**: avoids the PAT entirely, but only works on
  the machine it's running on — rejected because the user wants a hosted
  site reachable from any device.
- **Keep `items.yaml`, parse/re-serialize YAML client-side with js-yaml**:
  adds a client-side dependency and YAML round-tripping complexity for no
  real gain, since re-serializing already drops the hand-written header
  comment either way (same loss as moving to JSON) — rejected in favor of
  the simpler all-JSON data layer.
- **Separate GitHub Actions deploy workflow (upload/deploy-pages actions)**:
  unnecessary extra moving part when "deploy from branch /docs" already
  redeploys on every push, including the bot's own hourly commit.
