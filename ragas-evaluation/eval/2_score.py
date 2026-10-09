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
Step 2: Score the exported samples with RAGAS
uv run eval/2_score.py   (or `npm run eval`, which exports first)
---
Reads output/eval/samples.jsonl (written by src/1-export.ts) and scores
every answer with two LLM-as-a-judge metrics:

1. Faithfulness (RAGAS). Two judge calls per answer:
   a. split the answer into standalone claims,
   b. check each claim against the retrieved chunks (1 = supported, 0 = not).
   Score = supported claims / all claims. We run the two steps ourselves
   instead of metric.ascore(), so we keep the claims and verdicts for the
   walkthrough page. The score is computed by RAGAS's own _compute_score.

2. Refusal (a RAGAS DiscreteMetric with our own prompt): did the answer
   answer the question, or say the data doesn't cover it? Compared with the
   "expect" label in eval/questions.json.

Answers that are only the RAG prompt's refusal sentence ("I don't know
based on the data.", maybe with a line naming the artists) are marked refused
by a rule, without asking the judge: gpt-4o-mini kept counting the
"Artists used" line as an answer.

Refusal runs first. Faithfulness only runs on answers: "I don't know based on
the data" has no claims about the data to check, and the judge scores
leftovers like "Artists used: none" at random.

Writes output/eval/results.json. Python 3.12 or 3.13: one of RAGAS's
dependencies (scikit-network) has no build for 3.14 yet.
"""

import asyncio
import json
import math
import re
from pathlib import Path

from judge import JUDGE_MODEL, faithfulness, llm  # also loads .env
from ragas.metrics import DiscreteMetric
from ragas.metrics.collections.faithfulness.util import (
    NLIStatementInput,
    StatementGeneratorInput,
)

SAMPLES = Path("output/eval/samples.jsonl")
OUTPUT = Path("output/eval/results.json")
# Answers are scored in parallel, at most this many at once
CONCURRENCY = 4

refusal = DiscreteMetric(
    name="refusal",
    allowed_values=["answered", "refused"],
    prompt=(
        "A music Q&A assistant may only answer from its dataset. When the "
        "dataset doesn't cover a question, it should say it doesn't know.\n\n"
        "Question: {user_input}\n"
        "Response: {response}\n\n"
        "Score 'answered' if the response gives any answer from the data, "
        "even a partial one that says some of the question isn't covered. "
        "Score 'refused' only if it gives no answer at all, just that it "
        "doesn't know. A line that only lists the artists it looked at "
        "(like 'Artists used: X') is not an answer.\n\n"
        # Worked examples: gpt-4o-mini counted the first one as 'answered'
        # without them
        "Example: 'Artists used: Adele\\n\\nI don't know based on the data.' "
        "-> refused\n"
        "Example: 'Artists used: Adele, Sia\\n\\n- Adele: 21 (2011)\\n- Sia: "
        "I don't know based on the data.' -> answered"
    ),
)


async def score_faithfulness(sample: dict) -> dict:
    # Same steps as Faithfulness.ascore(), keeping what each step returns and
    # the prompts the judge saw (for the walkthrough page)
    question, response = sample["user_input"], sample["response"]
    statements = await faithfulness._create_statements(question, response)
    claims_prompt = faithfulness.statement_generator_prompt.to_string(
        StatementGeneratorInput(question=question, answer=response)
    )
    if not statements:
        return {"score": None, "claims": [], "prompts": {"claims": claims_prompt}}
    context = "\n".join(sample["retrieved_contexts"])
    verdicts = await faithfulness._create_verdicts(statements, context)
    score = faithfulness._compute_score(verdicts)
    return {
        "score": None if math.isnan(score) else score,
        "claims": [
            {"claim": v.statement, "supported": bool(v.verdict), "reason": v.reason}
            for v in verdicts.statements
        ],
        "prompts": {
            "claims": claims_prompt,
            "verdicts": faithfulness.nli_statement_prompt.to_string(
                NLIStatementInput(context=context, statements=statements)
            ),
        },
    }


# The sentence the RAG prompt (src/lib/pipeline.ts) tells the model to use
REFUSAL_SENTENCE = "i don't know based on the data."


def is_plain_refusal(response: str) -> bool:
    """True if the answer is the refusal sentence and nothing else, ignoring
    the line naming the artists, which the RAG prompt asks for. The model
    words that line differently each time ("Artists used:", "Artists I used
    from the provided context:"), so any line starting "Artist...:" counts."""
    rest = re.sub(r"(?im)^\s*artists?\b[^:\n]*:.*$", "", response)
    return rest.strip().lower().replace("\u2019", "'") == REFUSAL_SENTENCE


async def check_refusal(sample: dict) -> dict:
    if is_plain_refusal(sample["response"]):
        return {
            "value": "refused",
            "reason": "Rule: the answer is only the refusal sentence, so the judge wasn't asked.",
            "by": "rule",
            "prompt": None,
        }
    result = await refusal.ascore(
        llm=llm, user_input=sample["user_input"], response=sample["response"]
    )
    return {
        "value": result.value,
        "reason": result.reason,
        "by": "judge",
        "prompt": result.traces["input"],
    }


async def score_sample(i: int, sample: dict, limit: asyncio.Semaphore) -> dict:
    async with limit:
        refused = await check_refusal(sample)
        behaviour = "refuse" if refused["value"] == "refused" else "answer"
        faith = (
            await score_faithfulness(sample)
            if behaviour == "answer"
            else {"score": None, "claims": [], "prompts": {}}
        )
    print(
        f"[{i + 1}] {refused['value']} by {refused['by']} (expected {sample['expect']})"
        f"  faithfulness={faith['score'] if faith['score'] is not None else 'n/a'}"
        f"  {sample['user_input']}"
    )
    return {
        **sample,
        "faithfulness": faith,
        "refusal": {**refused, "correct": behaviour == sample["expect"]},
    }


async def main() -> None:
    samples = [json.loads(line) for line in SAMPLES.read_text().splitlines() if line]
    print(f"Scoring {len(samples)} samples with {JUDGE_MODEL}...")
    limit = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(
        *(score_sample(i, s, limit) for i, s in enumerate(samples))
    )

    scores = [r["faithfulness"]["score"] for r in results]
    scored = [s for s in scores if s is not None]
    summary = {
        "judge_model": JUDGE_MODEL,
        "samples": len(results),
        "faithfulness_mean": sum(scored) / len(scored) if scored else None,
        "faithfulness_scored": len(scored),
        "refusal_correct": sum(r["refusal"]["correct"] for r in results),
    }
    OUTPUT.write_text(
        json.dumps({"summary": summary, "results": results}, indent=2, ensure_ascii=False)
    )
    print(f"\n{json.dumps(summary, indent=2)}\nWrote {OUTPUT}")


asyncio.run(main())
