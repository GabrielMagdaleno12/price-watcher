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
