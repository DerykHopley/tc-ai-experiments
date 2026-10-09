# /// script
# requires-python = ">=3.12,<3.14"
# dependencies = [
#   "ragas==0.4.3",
#   "openai",
#   # Pinned: newer LangChain releases break
#   # "import ragas"
#   "langchain-core==1.3.2",
#   "langchain-openai==1.2.1",
# ]
# ///
"""
Step 4: Two judges, the same claims
uv run eval/4_cross_judge.py   (or `npm run cross-judge`)
---
rag-langchain's evaluation runs (copied to data/rag-langchain-runs/) hold 40
answers whose claims gemini-2.5-flash already judged against the retrieved
chunks. This script gives the same claims and the same chunks to RAGAS's
verdict step (gpt-4o-mini with RAGAS's own prompt) and records both
verdicts for every claim.

Only the verdict step runs. RAGAS's own claim splitting is skipped, because
the two judges split answers differently, and then there would be no
claim-by-claim comparison. The chunks are numbered exactly as
rag-langchain's prompt numbered them ([1] ..., [2] ...), so both judges saw
the same text.

Writes output/cross-judge/verdicts.json. Where the judges disagree, a human
decides who is right in eval/cross-judge-labels.json, and
`npm run cross-judge-page` turns both into output/cross-judge.html.
"""

import asyncio
import json
from pathlib import Path

from judge import JUDGE_MODEL, faithfulness  # also loads .env

RUNS_DIR = Path("data/rag-langchain-runs")
RUNS = ["top-k-a", "top-k-b", "two-per-artist", "one-per-artist"]
OUTPUT = Path("output/cross-judge/verdicts.json")
CONCURRENCY = 4


def format_context(chunks: list[str]) -> str:
    # Same as formatContext() in rag-langchain's src/lib/pipeline.ts
    return "\n\n".join(f"[{i + 1}] {text}" for i, text in enumerate(chunks))


async def judge_answer(run: str, result: dict, limit: asyncio.Semaphore) -> list[dict]:
    gemini = result["metrics"]["faithfulness"]["claims"]
    chunks = [r["text"] for r in result["retrieved"]]
    statements = [c["claim"] for c in gemini]
    async with limit:
        verdicts = (
            await faithfulness._create_verdicts(statements, format_context(chunks))
        ).statements
    if len(verdicts) != len(statements):
        # The judge has to return one verdict per claim, in order
        raise ValueError(
            f"{run}/{result['id']}: {len(statements)} claims, {len(verdicts)} verdicts"
        )
    print(f"{run}/{result['id']}: {len(statements)} claims")
    return [
        {
            "run": run,
            "id": result["id"],
            "question": result["question"],
            "answer": result["answer"],
            "chunks": chunks,
            "n": i,
            "claim": g["claim"],
            "gemini": {
                "supported": g["supported"],
                "reason": g["reason"],
                "source": g.get("source"),
            },
            "ragas": {"supported": bool(v.verdict), "reason": v.reason},
            "agree": g["supported"] == bool(v.verdict),
        }
        for i, (g, v) in enumerate(zip(gemini, verdicts))
    ]


async def main() -> None:
    jobs = []
    gemini_model = None
    limit = asyncio.Semaphore(CONCURRENCY)
    for run in RUNS:
        data = json.loads((RUNS_DIR / f"{run}.json").read_text())
        gemini_model = data["config"]["judgeModel"]
        for result in data["results"]:
            if result["metrics"].get("faithfulness", {}).get("claims"):
                jobs.append(judge_answer(run, result, limit))
    print(f"Judging {len(jobs)} answers with {JUDGE_MODEL} (RAGAS prompt)...")
    claims = [c for answer in await asyncio.gather(*jobs) for c in answer]

    agree = sum(c["agree"] for c in claims)
    summary = {
        "judges": {"gemini": gemini_model, "ragas": JUDGE_MODEL},
        "runs": RUNS,
        "answers": len(jobs),
        "claims": len(claims),
        "agree": agree,
        # Rows: Gemini's verdict. Columns: RAGAS's verdict.
        "matrix": {
            g: {
                r: sum(
                    c["gemini"]["supported"] == (g == "supported")
                    and c["ragas"]["supported"] == (r == "supported")
                    for c in claims
                )
                for r in ("supported", "unsupported")
            }
            for g in ("supported", "unsupported")
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"summary": summary, "claims": claims}, indent=2, ensure_ascii=False)
    )
    print(f"\n{json.dumps(summary, indent=2)}\nWrote {OUTPUT}")


asyncio.run(main())
