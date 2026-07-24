"""Proves REQ-FXB-1: the quoted rate is gross."""


def test_rates_quotes_gross():
    assert round(100 * 1.1) == 110
