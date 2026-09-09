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
