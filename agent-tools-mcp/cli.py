"""Terminal version: `uv run python cli.py "What's the weather in Tokyo?"`"""

import asyncio
import json
import sys

from agent import DemoAgent


async def main(question: str) -> None:
    demo = DemoAgent()
    await demo.setup()
    print("Tools:", ", ".join(f"{t['name']} [{t['source']}]" for t in demo.tool_info), "\n")

    async for s in demo.run_steps(question):
        match s["type"]:
            case "question":
                print(f"❓ {s['text']}")
            case "llm_start":
                print(f"\n🧠 LLM call #{s['turn']} ({s['message_count']} messages in context)")
            case "llm_end":
                if s["thinking"]:
                    print(f"   💭 {s['thinking'][:300]}")
                if s["text"]:
                    print(f"   💬 {s['text']}")
                for tc in s["tool_calls"]:
                    print(f"   ➡️  wants {tc['name']} [{tc['source']}] {json.dumps(tc['args'])}")
                print(f"   ({s['ms']} ms, stop_reason={s['stop_reason']}, tokens={s['tokens']})")
            case "tool_start":
                print(f"\n🔧 {s['name']} [{s['source']}] {json.dumps(s['args'])}")
            case "tool_end":
                print(f"   ⬅️  {s['output'][:300]}  ({s['ms']} ms)")
            case "final":
                print(f"\n✅ {s['text']}\n   ({s['llm_calls']} LLM calls, {s['ms']} ms total)")


if __name__ == "__main__":
    asyncio.run(main(" ".join(sys.argv[1:]) or "Is it warmer in Berlin or Tokyo right now?"))
