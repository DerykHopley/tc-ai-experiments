"""A tiny MCP server exposing fake weather data over stdio.

The data is made up so the prototype runs offline and gives repeatable answers.
"""

import hashlib

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather")

KNOWN_CITIES = {
    "berlin": {"temp_c": 14, "condition": "overcast", "humidity": 71},
    "london": {"temp_c": 12, "condition": "light rain", "humidity": 85},
    "tokyo": {"temp_c": 22, "condition": "sunny", "humidity": 58},
    "new york": {"temp_c": 17, "condition": "partly cloudy", "humidity": 63},
    "sydney": {"temp_c": 19, "condition": "windy", "humidity": 66},
}
CONDITIONS = ["sunny", "partly cloudy", "overcast", "light rain", "windy"]


def _lookup(city: str) -> dict:
    key = city.strip().lower()
    if key in KNOWN_CITIES:
        return KNOWN_CITIES[key]
    # Deterministic fake values for any other city.
    h = int(hashlib.sha256(key.encode()).hexdigest(), 16)
    return {
        "temp_c": 5 + h % 25,
        "condition": CONDITIONS[h % len(CONDITIONS)],
        "humidity": 40 + h % 50,
    }


@mcp.tool()
def get_current_weather(city: str) -> dict:
    """Get the current weather for a city. Temperatures are in Celsius."""
    return {"city": city, **_lookup(city)}


@mcp.tool()
def get_forecast(city: str, days: int = 3) -> list[dict]:
    """Get a daily forecast for a city for the next 1-7 days. Temperatures are in Celsius."""
    days = max(1, min(days, 7))
    base = _lookup(city)
    return [
        {
            "day": i + 1,
            "high_c": base["temp_c"] + (i % 3),
            "low_c": base["temp_c"] - 6 + (i % 2),
            "condition": CONDITIONS[(CONDITIONS.index(base["condition"]) + i) % len(CONDITIONS)],
        }
        for i in range(days)
    ]


if __name__ == "__main__":
    mcp.run(transport="stdio")
