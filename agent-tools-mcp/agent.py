"""LangChain agent wired to local tools + two MCP servers.

`run_steps()` runs one question and yields simple dict events describing each
step the agent takes, so a UI (or the CLI) can visualise the flow.
"""

import ast
import json
import operator
import os
import sys
import time
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from langchain.agents import create_agent
from langchain.tools import tool
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openrouter import ChatOpenRouter

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# OpenRouter if its key is set, otherwise straight to the Anthropic API.
USE_OPENROUTER = bool(os.environ.get("OPENROUTER_API_KEY"))
MODEL = (
    os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-5.5") if USE_OPENROUTER else "claude-opus-5-5"
)

SYSTEM_PROMPT = (
    "You are a helpful assistant in a demo app that shows how tool calling works. "
    "Use the available tools whenever they can answer part of the question; "
    "don't guess at weather, handbook policies, the current time, arithmetic, "
    "or how many leave days a date range uses. "
    "If you suggest alternative holiday dates, run calculate_leave on them before "
    "suggesting them, and only suggest dates the tool confirms fit the balances. "
    "Always reply in the language of the user's message, even when the question is "
    "about another country (an English question gets an English answer). "
    "Keep final answers short."
)

# --- Local tools: plain Python functions turned into LangChain tools ---------

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
}


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    raise ValueError("Only numbers and + - * / ** % are allowed")


@tool
def calculator(expression: str) -> str:
    """Evaluate an arithmetic expression, e.g. '0.17 * 2340' or '(22 - 14) * 9 / 5'."""
    return str(_eval(ast.parse(expression, mode="eval").body))


@tool
def current_time(timezone: str = "UTC") -> str:
    """Get the current date and time in an IANA timezone, e.g. 'Europe/Berlin'."""
    return datetime.now(ZoneInfo(timezone)).strftime("%A %Y-%m-%d %H:%M %Z")


LOCAL_TOOLS = [calculator, current_time]

# --- MCP servers: separate processes, spoken to over stdio --------------------

MCP_SERVERS = {
    "weather": {
        "transport": "stdio",
        "command": sys.executable,
        "args": [str(ROOT / "mcp_servers" / "weather_server.py")],
    },
    "handbook": {
        "transport": "stdio",
        "command": sys.executable,
        "args": [str(ROOT / "mcp_servers" / "handbook_server.py")],
    },
}


class DemoAgent:
    def __init__(self) -> None:
        self.agent = None
        self.tool_sources: dict[str, str] = {}  # tool name -> "local" | "mcp:<server>"
        self.tool_info: list[dict] = []

    async def setup(self) -> None:
        client = MultiServerMCPClient(MCP_SERVERS)
        tools = list(LOCAL_TOOLS)
        for t in LOCAL_TOOLS:
            self.tool_sources[t.name] = "local"
        for server in MCP_SERVERS:
            server_tools = await client.get_tools(server_name=server)
            for t in server_tools:
                self.tool_sources[t.name] = f"mcp:{server}"
            tools.extend(server_tools)

        self.tool_info = [
            {"name": t.name, "source": self.tool_sources[t.name], "description": t.description}
            for t in tools
        ]
        self.agent = create_agent(_make_model(), tools, system_prompt=SYSTEM_PROMPT)

    def graph_mermaid(self) -> str:
        return self.agent.get_graph().draw_mermaid()

    async def run_steps(self, question: str) -> AsyncIterator[dict]:
        """Yield one event per step: llm_start/llm_end, tool_start/tool_end, final."""
        started = time.perf_counter()
        llm_turn = 0
        llm_started: dict[str, float] = {}
        tool_started: dict[str, float] = {}
        final_text = ""

        def elapsed(since: float) -> int:
            return round((time.perf_counter() - since) * 1000)

        yield {"type": "question", "text": question}

        async for ev in self.agent.astream_events(
            {"messages": [{"role": "user", "content": question}]}, version="v2"
        ):
            kind, run_id = ev["event"], ev["run_id"]

            if kind == "on_chat_model_start":
                llm_turn += 1
                llm_started[run_id] = time.perf_counter()
                yield {
                    "type": "llm_start",
                    "id": run_id,
                    "turn": llm_turn,
                    "node": ev["metadata"].get("langgraph_node"),
                    "message_count": len(ev["data"]["input"]["messages"][0]),
                }

            elif kind == "on_chat_model_end":
                msg = ev["data"]["output"]
                thinking, text = _split_content(msg.content)
                # OpenRouter puts the reasoning summary here rather than in content blocks.
                thinking = thinking or msg.additional_kwargs.get("reasoning_content", "")
                tool_calls = [
                    {"id": tc["id"], "name": tc["name"], "args": tc["args"],
                     "source": self.tool_sources.get(tc["name"], "unknown")}
                    for tc in msg.tool_calls
                ]
                if text and not tool_calls:
                    final_text = text
                usage = msg.usage_metadata or {}
                yield {
                    "type": "llm_end",
                    "id": run_id,
                    "turn": llm_turn,
                    "ms": elapsed(llm_started.pop(run_id, started)),
                    "thinking": thinking,
                    "text": text,
                    "tool_calls": tool_calls,
                    "stop_reason": msg.response_metadata.get("stop_reason")
                    or msg.response_metadata.get("finish_reason"),
                    "tokens": {"in": usage.get("input_tokens"), "out": usage.get("output_tokens")},
                }

            elif kind == "on_tool_start":
                tool_started[run_id] = time.perf_counter()
                yield {
                    "type": "tool_start",
                    "id": run_id,
                    "name": ev["name"],
                    "source": self.tool_sources.get(ev["name"], "unknown"),
                    "args": ev["data"].get("input"),
                }

            elif kind == "on_tool_end":
                out = ev["data"].get("output")
                yield {
                    "type": "tool_end",
                    "id": run_id,
                    "name": ev["name"],
                    "source": self.tool_sources.get(ev["name"], "unknown"),
                    "ms": elapsed(tool_started.pop(run_id, started)),
                    "output": _stringify(getattr(out, "content", out)),
                    "is_error": getattr(out, "status", None) == "error",
                }

        yield {"type": "final", "text": final_text, "ms": elapsed(started), "llm_calls": llm_turn}


def _make_model():
    if USE_OPENROUTER:
        return ChatOpenRouter(
            model=MODEL,
            max_tokens=16000,
            reasoning={"effort": "medium", "summary": "auto"},
        )
    return ChatAnthropic(
        model=MODEL,
        max_tokens=16000,
        # Opus 5.5 always thinks; "summarized" lets us show that reasoning as a step.
        thinking={"type": "adaptive", "display": "summarized"},
        output_config={"effort": "medium"},
    )


def _split_content(content) -> tuple[str, str]:
    """Split an AIMessage's content into (thinking summary, visible text)."""
    if isinstance(content, str):
        return "", content
    thinking, text = [], []
    for block in content:
        if isinstance(block, str):
            text.append(block)
        elif block.get("type") == "thinking" and block.get("thinking"):
            thinking.append(block["thinking"])
        elif block.get("type") == "text":
            text.append(block["text"])
    return "\n".join(thinking), "".join(text)


def _stringify(value) -> str:
    """MCP tool results arrive as content blocks; flatten them to text for display."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [b.get("text", json.dumps(b)) if isinstance(b, dict) else str(b) for b in value]
        return "\n".join(parts)
    return json.dumps(value, default=str)
