# Agent tools and MCP (LangChain)

A learning prototype for how a LangChain agent uses tools: two local Python tools and two MCP servers, with a page that steps through each LLM call, tool call and message.

## What turned up

- **The LLM never runs a tool.** It replies with a tool name and arguments. `create_agent()` builds a LangGraph loop of two nodes: the model node calls the LLM, and the tools node runs the calls and adds the results as messages. When the LLM replies without tool calls, the loop ends.
- **To the LLM, MCP tools look the same as local ones.** `langchain-mcp-adapters` wraps each MCP tool as an ordinary LangChain tool. The difference is where they run. A local tool took 0 ms. An MCP call took about 300 ms, because the adapter opens a new session for every call, which here means starting a new server process.
- **Every LLM call resends everything.** Even "What is the capital of France?" sent about 1,400 input tokens, mostly the 8 tool schemas. Each tool round trip adds messages: the handbook question grew from 2 to 7 messages and from 1,415 to 1,922 input tokens over 3 calls.
- **A date tool mattered less for the main answer than for checking alternatives.** Before `calculate_leave` existed, the model counted the working days and remembered Berlin's public holidays itself, and got the leave-across-two-years question right. But its suggested alternative ("off from 26 Dec plus 24 Dec") didn't make sense, and it never checked it. With the tool, and a prompt line saying to check suggestions with it, the model ran a second `calculate_leave` call on its alternative in some runs. In the others it offered to look instead.
- **The model decides when a sum is worth a tool.** The system prompt says not to guess at arithmetic. It still did `5 - 8` and `28 - 5` itself in every leave run, but used the calculator for `(22 - 14) * 9 / 5`, and in the recorded run for `28 + 3`.
- **It answered in German** on 2 of the first 4 leave runs, apparently because the question mentions Berlin. A prompt line saying to reply in the language of the question fixed it in the runs after.

## See the results

**[Flow](https://derykhopley.github.io/tc-ai-experiments/agent-tools-mcp/output/flow.html)**: six recorded questions, from no tools to parallel MCP calls, replayed step by step. It shows a flow diagram, every LLM and tool call with inputs and outputs, and the messages in the agent's state. Nothing is sent to a model when you use it.

In the "Leave across two years" example, the two calculator steps are illustrative: in the real run the model did those subtractions itself. The page marks them.

## Setup

This project is Python, not Node like the others.

- Python 3.13 and [uv](https://docs.astral.sh/uv/)
- `uv sync`
- Copy `.env.example` to `.env` and add an [OpenRouter](https://openrouter.ai) key. The model defaults to `anthropic/claude-sonnet-5.5`; set `OPENROUTER_MODEL` to change it. If your OpenRouter guardrails block a provider, requests fail with "0 endpoints … available matching your guardrail restrictions".

The MCP servers start automatically as subprocesses; you don't run them yourself.

| Command | What it does |
| --- | --- |
| `uv run uvicorn server:app --reload` | The live version at http://localhost:8000: ask your own questions and watch them run. |
| `uv run python cli.py "question"` | The same steps printed in the terminal. |
| `uv run python record.py` | Runs the six example questions, saves `output/runs.json` and builds `output/flow.html`. |
| `uv run python record.py --render` | Rebuilds `output/flow.html` from `output/runs.json`, without API calls. |

## Files

| File | What's in it |
| --- | --- |
| `agent.py` | The agent: `create_agent()` with the two local tools (`calculator`, `current_time`) and the MCP tools. `run_steps()` turns LangChain's `astream_events` into one event per step. |
| `mcp_servers/weather_server.py` | MCP server with made-up weather: `get_current_weather`, `get_forecast`. |
| `mcp_servers/handbook_server.py` | MCP server with a made-up team handbook: `list_policies`, `get_policy`, `search_handbook`, and `calculate_leave`, which counts the working days a holiday needs, split by year, using public-holiday data from the [`holidays`](https://pypi.org/project/holidays/) package. |
| `server.py`, `static/index.html` | The live web version. Steps are streamed with server-sent events. |
| `record.py`, `static/flow-template.html` | Recording and the static replay page. |

The weather and handbook data are invented for this project.
