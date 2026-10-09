"""
Draw the sample of claims both judges agreed on, for checking by hand
python3 eval/sample_agreements.py   (standard library only)
---
Only the disagreements in output/cross-judge/verdicts.json were checked at
first, but both judges can be wrong on the same claim. This draws a sample
of the agreements: every claim both rejected (there are few) plus a random
draw of claims both accepted, with a fixed seed so the draw can be repeated.

Adds the sampled claims to eval/agreement-sample.json, keeping any decisions
already made there. A decision of null means not checked yet.
"""

import json
import random
from pathlib import Path

VERDICTS = Path("output/cross-judge/verdicts.json")
SAMPLE = Path("eval/agreement-sample.json")
SEED = 42
ACCEPTED = 18  # plus every claim both judges rejected

claims = json.loads(VERDICTS.read_text())["claims"]
agreed = [c for c in claims if c["agree"]]
rejected = [c for c in agreed if not c["gemini"]["supported"]]
accepted = [c for c in agreed if c["gemini"]["supported"]]
drawn = rejected + random.Random(SEED).sample(accepted, ACCEPTED)

existing = json.loads(SAMPLE.read_text()) if SAMPLE.exists() else {}
sample = {}
for c in drawn:
    key = f"{c['run']}/{c['id']}/{c['n']}"
    sample[key] = existing.get(key) or {
        "claim": c["claim"],
        "judges_said": c["gemini"]["supported"],
        "supported": None,
        "evidence": "",
        "by": None,
    }
SAMPLE.write_text(json.dumps(sample, indent=2, ensure_ascii=False) + "\n")
undecided = sum(v["supported"] is None for v in sample.values())
print(f"{len(sample)} sampled claims in {SAMPLE}, {undecided} not checked yet")
