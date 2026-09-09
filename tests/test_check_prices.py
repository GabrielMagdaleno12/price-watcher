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


def test_process_items_continues_when_one_notify_fn_raises():
    items = [{"name": "Tenis X", "url": "https://loja.com/x", "target_price": 600.0}]
    sent = []

    def failing_notify(message):
        raise RuntimeError("webhook down")

    new_state = process_items(
        items,
        state={},
        fetch_html_fn=lambda url: HTML_599,
        notify_fns=[failing_notify, sent.append],
    )

    assert len(sent) == 1
    assert "Tenis X" in sent[0]
    assert new_state["https://loja.com/x"]["price"] == 599.90
