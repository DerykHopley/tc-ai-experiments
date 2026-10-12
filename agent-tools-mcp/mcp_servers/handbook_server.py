"""A tiny MCP server exposing a fake team handbook over stdio.

Stands in for the kind of internal knowledge base you'd normally wire up via MCP.
"""

import datetime as dt

import holidays
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("handbook")

POLICIES = {
    "holiday": "Full-time staff get 28 days of paid holiday per year, plus public holidays. "
    "Up to 5 unused days can be carried over to the next year.",
    "remote-work": "Staff may work remotely up to 3 days a week. Core hours are 10:00-15:00 local time.",
    "expenses": "Expenses under 50 EUR need no pre-approval. Anything above needs manager sign-off "
    "before purchase. Submit receipts within 30 days.",
    "equipment": "Every new starter gets a laptop and a 400 EUR home-office budget, renewed every 3 years.",
    "on-call": "On-call rotations are one week long. Each on-call week earns 1 extra day of holiday.",
}


@mcp.tool()
def list_policies() -> list[str]:
    """List the names of all policies in the team handbook."""
    return sorted(POLICIES)


@mcp.tool()
def get_policy(name: str) -> str:
    """Get the full text of a handbook policy by its name (see list_policies)."""
    return POLICIES.get(name.strip().lower(), f"No policy named '{name}'. Try list_policies.")


@mcp.tool()
def search_handbook(query: str) -> list[dict]:
    """Keyword search across all handbook policies. Returns matching policies."""
    words = [w for w in query.lower().split() if len(w) > 2]
    hits = [
        {"policy": name, "text": text}
        for name, text in POLICIES.items()
        if any(w in name or w in text.lower() for w in words)
    ]
    return hits or [{"policy": None, "text": "No matches."}]


@mcp.tool()
def calculate_leave(
    start_date: str, end_date: str, country: str = "DE", subdivision: str | None = None
) -> dict:
    """Count the leave days needed for a holiday, split by calendar year.

    Dates are inclusive, in YYYY-MM-DD format. Weekends and public holidays don't
    use leave. `country` is an ISO code like "DE" or "GB"; `subdivision` is an
    optional state/region code (e.g. "BE" for Berlin, "BY" for Bavaria), since
    some public holidays only apply regionally.
    """
    start, end = dt.date.fromisoformat(start_date), dt.date.fromisoformat(end_date)
    if end < start:
        raise ValueError("end_date is before start_date")
    if (end - start).days > 366:
        raise ValueError("Range is longer than a year")

    public = holidays.country_holidays(
        country, subdiv=subdivision, years=range(start.year, end.year + 1)
    )
    by_year: dict[str, dict] = {}
    day = start
    while day <= end:
        year = by_year.setdefault(
            str(day.year), {"leave_days": 0, "leave_dates": [], "public_holidays": [], "weekend_days": 0}
        )
        if day in public:
            year["public_holidays"].append(f"{day} ({day:%a}) {public[day]}")
        elif day.weekday() >= 5:
            year["weekend_days"] += 1
        else:
            year["leave_days"] += 1
            year["leave_dates"].append(f"{day} ({day:%a})")
        day += dt.timedelta(days=1)

    return {
        "start": f"{start} ({start:%a})",
        "end": f"{end} ({end:%a})",
        "region": country + (f"-{subdivision}" if subdivision else ""),
        "by_year": by_year,
        "total_leave_days": sum(y["leave_days"] for y in by_year.values()),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
