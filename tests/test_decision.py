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


def test_no_repeat_alert_when_already_at_or_below_target():
    assert should_alert(current_price=499.0, target_price=500.0, last_price=499.0) is False


def test_alerts_when_price_crosses_below_target():
    assert should_alert(current_price=499.0, target_price=500.0, last_price=600.0) is True
