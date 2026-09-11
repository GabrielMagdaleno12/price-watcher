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
4. **GitHub Pages**: veja a seção "Habilitar o GitHub Pages" abaixo do
   "Dashboard".

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

Settings → Pages → Source: "Deploy from a branch" → branch `master`, pasta
`/docs`.

## Rodando localmente (opcional, para testes)

```bash
pip install -r requirements-dev.txt
python -m pytest
```
