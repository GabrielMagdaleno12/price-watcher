from parsers import extract_price

HTML_WITH_OFFER_DICT = """
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Product","name":"Tenis X",
 "offers":{"@type":"Offer","price":"599.90","priceCurrency":"BRL"}}
</script>
</head><body></body></html>
"""

HTML_WITH_OFFERS_LIST = """
<html><head>
<script type="application/ld+json">
{"@type":"Product","offers":[{"@type":"Offer","price":"1234.5"}]}
</script>
</head></html>
"""

HTML_WITH_MALFORMED_JSON_THEN_VALID = """
<html><head>
<script type="application/ld+json">{not valid json</script>
<script type="application/ld+json">
{"@type":"Product","offers":{"price": 42.0}}
</script>
</head></html>
"""

HTML_WITHOUT_JSONLD = "<html><body><span class='price'>R$ 10,00</span></body></html>"

HTML_WITH_GRAPH = """
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Product","offers":{"price":77.5}}]}
</script>
</head></html>
"""


def test_extracts_price_from_offer_dict():
    assert extract_price(HTML_WITH_OFFER_DICT) == 599.90


def test_extracts_price_from_offers_list():
    assert extract_price(HTML_WITH_OFFERS_LIST) == 1234.5


def test_skips_malformed_jsonld_and_uses_next_script():
    assert extract_price(HTML_WITH_MALFORMED_JSON_THEN_VALID) == 42.0


def test_returns_none_when_no_structured_price_found():
    assert extract_price(HTML_WITHOUT_JSONLD) is None


def test_extracts_price_from_graph_wrapped_jsonld():
    assert extract_price(HTML_WITH_GRAPH) == 77.5
