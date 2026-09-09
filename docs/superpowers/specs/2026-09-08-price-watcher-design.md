# Price Watcher — Design

## Goal

Monitor the price of user-chosen products across several Brazilian e-commerce
sites and send an alert (Telegram + Discord) when a tracked product's price
drops or reaches a target value. Must run entirely in the cloud (GitHub
Actions) so the user's PC does not need to be on, and must cost nothing.

## Non-goals

- No web UI/dashboard — the item list is a plain file edited directly on
  GitHub (web or mobile app).
- No WhatsApp support (see rejected alternatives).
- No guarantee of price accuracy on sites with strong anti-bot protection —
  those sites are marked unreliable in `items.yaml` comments after testing,
  not silently trusted.
- No per-failure alerting — a scrape failure is logged in the Actions run,
  not sent as a notification. Only price events are notified.

## Architecture

```
GitHub repo (public)
├── items.yaml                  <- user-edited list of tracked products
├── state.json                  <- last known price per item (committed back by the workflow)
├── check_prices.py             <- the scraper/notifier
├── requirements.txt
└── .github/workflows/
    └── check-prices.yml        <- cron schedule + manual trigger
```

- **Trigger**: `schedule` (cron, default every hour) and `workflow_dispatch`
  (manual "Run workflow" button, used for testing and for on-demand checks).
- **Runner**: standard GitHub-hosted `ubuntu-latest` runner. Public repo =
  unlimited free Actions minutes.
- **Secrets**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`
  stored as encrypted GitHub Actions repository secrets — never committed to
  the repo, never pasted into chat. The user adds them directly in
  Settings → Secrets and variables → Actions.

## Data model

`items.yaml`:
```yaml
- name: "Tênis Nike Air Max"
  url: "https://www.example.com/produto/123"
  target_price: 599.90     # optional — omit to alert on any price drop
- name: "PS5 Slim"
  url: "https://www.kabum.com.br/produto/456"
```

`state.json` (auto-managed, not hand-edited):
```json
{
  "https://www.example.com/produto/123": {"price": 649.90, "checked_at": "2026-09-08T14:00:00Z"}
}
```

## Price extraction

`check_prices.py` keeps a small map of domain → CSS selector/regex used to
pull the price out of the fetched HTML, since layout differs per store
(Kabum, Magazine Luiza, Mercado Livre, Amazon BR, Pichau, Terabyte). Requests
are made with a realistic browser `User-Agent` header. Sites that block
simple HTTP fetches (most likely Amazon and Mercado Livre) are flagged
during the testing step below rather than assumed to work.

## Alert logic

For each item, after extracting the current price:
- If `target_price` is set: alert when `current_price <= target_price`.
- If not set: alert when `current_price < state[url].price` (any drop since
  last successful check).
- After evaluating, `state.json` is updated with the current price
  regardless of whether an alert fired, so future comparisons use the latest
  known value.

## Notifications

Both channels receive the same message on an alert:
`"📉 {name} caiu para R$ {price} (link)"`.
- **Telegram**: `POST` to `https://api.telegram.org/bot<token>/sendMessage`.
- **Discord**: `POST` to the channel webhook URL.
Both are simple HTTP calls with `requests` — no extra dependencies.

## Error handling

- A failed fetch/parse for one item is caught, logged to the workflow run
  output, and that item is skipped for the cycle — it does not stop the
  rest of the batch and does not send a notification.
- If `TELEGRAM_BOT_TOKEN`/`DISCORD_WEBHOOK_URL` secrets are missing, that
  channel is skipped (logged), so partial setup (e.g., Telegram only) still
  works.

## Testing plan

1. Run the workflow manually (`workflow_dispatch`) with one item per store
   in `items.yaml` and confirm which of the 6 sites return a usable price.
2. Temporarily set a `target_price` above the current price to confirm an
   alert fires correctly on both Telegram and Discord.
3. Confirm `state.json` is committed back correctly after a run.
4. Only after manual runs look correct, enable the cron schedule.

## One-time setup (user does this, outside of code)

1. Create a Telegram bot via @BotFather → get bot token; message the bot
   once → note the chat ID.
2. Create a Discord webhook in a server/channel the user owns → get the
   webhook URL.
3. Create the GitHub repo (`price-watcher`, public) and add the three
   secrets under Settings → Secrets and variables → Actions.

## Rejected alternatives

- **Claude Code scheduled cloud routine**: consumes the user's Claude usage
  quota per run (minimum interval 1 hour) instead of being free; also no
  guaranteed delivery path to a phone.
- **Local script + Windows Task Scheduler**: works, but requires the PC to
  be on at check time — rejected per user's requirement to not depend on
  the PC.
- **WhatsApp notifications**: no free, ToS-compliant way to automate
  personal WhatsApp messages; unofficial libraries risk the number being
  banned, and the official Business API is paid and built for businesses,
  not personal alerts.
