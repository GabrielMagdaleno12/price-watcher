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
