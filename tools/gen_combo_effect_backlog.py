#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2-A.3에서 처음 만들고 P2-A.4에서 재생성 가능하도록 영속화한
source/data/combo-effect-support-backlog.json 생성기.

대상: identity-complete(모든 requiredItems가 resolved) + conditionalRaw 없음 +
status="unsupported"인 combo. 각 unsupportedEffects[].constant별로:
  - occurrenceCombos: 몇 개의 그런 combo에 등장하는지
  - soloFixRuntimeReadyPotential: 그 combo에서 유일한 unsupported constant라
    지원 시 즉시 verified(runtime-ready)가 되는 combo 수

실행: python3 tools/gen_combo_effect_backlog.py
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMBOS_JSON = ROOT / "source" / "data" / "db-combos.json"
OUT_JSON = ROOT / "source" / "data" / "combo-effect-support-backlog.json"


def main():
    combos = json.load(open(COMBOS_JSON, encoding="utf-8"))["combos"]

    occurrence = defaultdict(set)
    solo_fix = defaultdict(set)

    for c in combos:
        if c["status"] != "unsupported":
            continue
        if c.get("conditionalRaw"):
            continue
        if not all(r.get("resolved") for r in c.get("requiredItems", [])):
            continue
        constants = sorted({u["constant"] for u in c.get("unsupportedEffects", [])})
        for const in constants:
            occurrence[const].add(c["id"])
        if len(constants) == 1:
            solo_fix[constants[0]].add(c["id"])

    backlog = []
    for const in sorted(occurrence.keys(), key=lambda k: (-len(occurrence[k]), k)):
        backlog.append({
            "constant": const,
            "occurrenceCombos": len(occurrence[const]),
            "soloFixRuntimeReadyPotential": len(solo_fix[const]),
            "affectedComboIds": sorted(occurrence[const]),
        })

    out = {
        "generatedFrom": "db-combos.json (identity-complete + no conditionalRaw + status=unsupported)",
        "note": "soloFixRuntimeReadyPotential = 이 constant 하나만 지원하면 즉시 verified(runtime-ready)가 되는 콤보 수(그 콤보의 유일한 unsupported constant인 경우만)",
        "backlog": backlog,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK - wrote {OUT_JSON} ({len(backlog)} constants)")


if __name__ == "__main__":
    main()
