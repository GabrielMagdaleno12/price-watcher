from typing import Optional


def should_alert(current_price: float, target_price: Optional[float], last_price: Optional[float]) -> bool:
    if target_price is not None:
        return current_price <= target_price and (last_price is None or last_price > target_price)
    if last_price is not None:
        return current_price < last_price
    return False
