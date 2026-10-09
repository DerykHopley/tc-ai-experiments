"""
The judge shared by 2_score.py and 4_cross_judge.py: gpt-4o-mini through
OpenRouter, wrapped for RAGAS, and RAGAS's Faithfulness metric. Importing
this reads .env and turns off RAGAS's usage analytics.
"""

import os
from pathlib import Path

# RAGAS sends usage analytics unless this is set before it's imported
os.environ.setdefault("RAGAS_DO_NOT_TRACK", "true")

from openai import AsyncOpenAI  # noqa: E402
from ragas.llms import llm_factory  # noqa: E402
from ragas.metrics.collections import Faithfulness  # noqa: E402

# A different model from the one that wrote the answers (gpt-5-mini)
JUDGE_MODEL = "openai/gpt-4o-mini"


def load_env(path: Path = Path(".env")) -> None:
    """Read KEY=value lines from .env, like tsx --env-file does for the TS side."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_env()
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)
# The default 1024 output tokens cuts off the claim list for long answers
llm = llm_factory(JUDGE_MODEL, client=client, max_tokens=4096)

faithfulness = Faithfulness(llm=llm)
