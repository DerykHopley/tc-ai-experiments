"""Record real agent runs and build the static replay page.

    uv run python record.py            # run every scenario, save output/runs.json, build output/flow.html
    uv run python record.py --render   # rebuild output/flow.html from output/runs.json, no API calls
"""

import asyncio
import json
import sys
from datetime import date
from pathlib import Path

from agent import MODEL, DemoAgent, calculator

ROOT = Path(__file__).parent
RUNS = ROOT / "output" / "runs.json"
PAGE = ROOT / "output" / "flow.html"
TEMPLATE = ROOT / "static" / "flow-template.html"

SCENARIOS = [
    {
        "id": "no-tools",
        "title": "No tools needed",
        "question": "What is the capital of France?",
        "note": "The model answers from what it already knows. One LLM call, no tools.",
    },
    {
        "id": "local-tool",
        "title": "One local tool",
        "question": "What's 17.5% of 2,340?",
        "note": "The model calls the calculator, a plain Python function in the same process.",
    },
    {
        "id": "mcp-tool",
        "title": "One MCP tool",
        "question": "What's the weather in Tokyo?",
        "note": "The weather tool lives in a separate MCP server process. LangChain sends it a "
        "tools/call request over stdio.",
    },
    {
        "id": "parallel-mixed",
        "title": "Parallel calls, then a local tool",
        "question": "Is it warmer in Berlin or Tokyo right now, and by how many degrees Fahrenheit?",
        "note": "Two MCP calls in parallel, then the calculator converts the difference to °F. "
        "Each tool result goes back to the model before it decides the next step.",
    },
    {
        "id": "handbook",
        "title": "Knowledge base over MCP",
        "question": "If I do 3 on-call weeks this year, how many holiday days will I have in total?",
        "note": "The handbook MCP server stands in for an internal knowledge base.",
    },
    {
        "id": "holiday-bridge",
        "title": "Leave across two years",
        "question": "I'm based in Berlin, Germany. I have 5 days of holiday left for 2026 and my full "
        "28 days for 2027. I'd like to be off from Saturday 19 December 2026 to Sunday 10 January "
        "2027. How many leave days does that use from each year, and does it work with my balances?",
        "note": "calculate_leave does the date work in code: weekends, Berlin's public holidays and "
        "the split at New Year.",
        "illustrative_calculator": True,
    },
]


async def record() -> list[dict]:
    demo = DemoAgent()
    await demo.setup()
    runs = []
    for s in SCENARIOS:
        print(f"→ {s['id']}: {s['question'][:70]}")
        events = [e async for e in demo.run_steps(s["question"])]
        runs.append({"scenario": s["id"], "events": events})
    return {"model": MODEL, "recorded": date.today().isoformat(), "tools": demo.tool_info, "runs": runs}


def add_illustrative_calculator(events: list[dict]) -> list[dict]:
    """Insert a balance check with the calculator before the final LLM call.

    In the real runs the model did these subtractions itself. The extra steps
    are marked `illustrative` and the page labels them as such.
    """
    leave = [e for e in events if e["type"] == "tool_end" and e["name"] == "calculate_leave"]
    if not leave:
        return events
    by_year = json.loads(leave[0]["output"])["by_year"]
    need_26, need_27 = by_year["2026"]["leave_days"], by_year["2027"]["leave_days"]
    sums = [f"5 - {need_26}", f"28 - {need_27}"]

    final_start = max(i for i, e in enumerate(events) if e["type"] == "llm_start")
    turn = events[final_start]["turn"]
    msgs = events[final_start]["message_count"]
    calls = [
        {"id": f"illustrative-{i}", "name": "calculator", "args": {"expression": expr}, "source": "local"}
        for i, expr in enumerate(sums)
    ]
    inserted = [
        {"type": "llm_start", "id": "illustrative-llm", "turn": turn, "message_count": msgs, "illustrative": True},
        {"type": "llm_end", "id": "illustrative-llm", "turn": turn, "ms": None, "thinking": "",
         "text": "", "tool_calls": calls, "stop_reason": "tool_calls",
         "tokens": {"in": None, "out": None}, "illustrative": True},
    ]
    for c in calls:
        inserted.append({"type": "tool_start", "id": c["id"], "name": "calculator", "source": "local",
                         "args": c["args"], "illustrative": True})
    for c in calls:
        inserted.append({"type": "tool_end", "id": c["id"], "name": "calculator", "source": "local",
                         "ms": 0, "output": calculator.invoke(c["args"]), "is_error": False,
                         "illustrative": True})

    out = events[:final_start] + inserted
    for e in events[final_start:]:
        e = dict(e)
        if e["type"] in ("llm_start", "llm_end"):
            e["turn"] = turn + 1
        if e["type"] == "llm_start":
            e["message_count"] = msgs + 1 + len(calls)
        if e["type"] == "final":
            e["llm_calls"] += 1
        out.append(e)
    return out


def render(data: dict) -> None:
    by_id = {r["scenario"]: r["events"] for r in data["runs"]}
    scenarios = []
    for s in SCENARIOS:
        events = by_id[s["id"]]
        if s.get("illustrative_calculator"):
            events = add_illustrative_calculator(events)
        scenarios.append({**s, "events": events})
    payload = {"model": data["model"], "recorded": data["recorded"], "tools": data["tools"],
               "scenarios": scenarios}
    html = TEMPLATE.read_text().replace(
        "/*__DATA__*/null", json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    )
    PAGE.write_text(html)
    print(f"Wrote {PAGE.relative_to(ROOT)}")


if __name__ == "__main__":
    if "--render" not in sys.argv:
        RUNS.parent.mkdir(exist_ok=True)
        RUNS.write_text(json.dumps(asyncio.run(record()), indent=2, ensure_ascii=False, default=str))
        print(f"Wrote {RUNS.relative_to(ROOT)}")
    render(json.loads(RUNS.read_text()))
