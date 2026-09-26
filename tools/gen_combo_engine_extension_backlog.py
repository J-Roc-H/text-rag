#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2-A.4 -- source/data/combo-engine-extension-backlog.json 생성.

combo-effect-support-matrix.json에서 verdict가 engine-extension-required /
trigger-model-missing / identity-mapping-gap(즉 이번 단계에서 canonicalize_combos.py에
연결하지 않은 전부)인 constant를, "지원하면 몇 개 콤보에 영향을 주는가"(unlockPotential,
matrix의 comboCount) / "엔진 작업량"(engineComplexity, 아래 표로 수동 배정 -- P2-A.4
실코드 재확인 과정에서 파악한 구체적 이유가 근거) 비율로 우선순위를 매긴다. 단순 빈도
1위가 항상 1순위가 아니다(예: bSubRace는 빈도 1위지만 identity-mapping-gap이라 이
목록에서는 별도로 낮게 평가될 수 있음).

engineComplexity 3단계:
  - low:    필요한 구조 데이터가 이미 존재, 소비처 함수 1개 추가/확장 수준
  - medium: 새 canonical 필드 + 소비처 함수가 필요하나 기존 패턴(예: 카드 이벤트) 재사용 가능
  - high:   새 메커닉/새 데이터 모델 자체가 필요(예: 몬스터 공격 원거리 판별, 스킬 identity
            매핑 테이블, onDamaged 집계 인프라 전체)

실행: python3 tools/gen_combo_engine_extension_backlog.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATRIX_JSON = ROOT / "source" / "data" / "combo-effect-support-matrix.json"
OUT_JSON = ROOT / "source" / "data" / "combo-engine-extension-backlog.json"

COMPLEXITY_WEIGHT = {"low": 1, "medium": 2, "high": 3}

# 수동 배정 근거는 VERDICT_TABLE의 evidence 텍스트(gen_combo_effect_support_matrix.py)에
# 이미 기록돼 있다 -- 여기서는 그 근거를 요약해 complexity 등급만 매긴다.
COMPLEXITY = {
    "bLongAtkRate": ("low", "isRangedWeapon 구조 데이터 이미 존재, getOutgoingAtkPctMul류 함수 1개 추가"),
    "bAddClass": ("medium", "Class_Normal/Guardian/Battlefield -- isMvp의 반대 조건(Normal)은 쉬우나 Guardian/Battlefield는 몬스터 분류 신규 필요"),
    "bAddEff": ("medium", "seProc 이벤트 구조 재사용 가능하나 turns 기본값 정책을 새로 정해야 함(rAthena가 안 줌)"),
    "bResEff": ("medium", "isStatusImmune 옆에 부분 저항 % 롤 로직 추가 -- 패턴은 있으나 새 필드 필요"),
    "bMatkRate": ("medium", "buildMatkBreakdown에 %가산 항 추가 -- 계산식은 단순하나 신규 canonical 필드"),
    "bSkillAtk": ("medium", "skillDmg canonical 필드는 이미 있음, 스킬 데미지 계산 지점에 곱연산 삽입 필요(그 지점 자체 존재 여부 미확인)"),
    "bLongAtkDef": ("high", "몬스터 공격의 원거리/근접 판별 메타데이터 자체가 없음(신규 데이터 모델)"),
    "bAspdRate": ("high", "%기반 아스피드와 기존 flat aspd(*20ms) 단위 체계를 통합하는 리팩터 필요"),
    "bAutoSpell": ("high", "rAthena 스킬ID -> TextRAG 스킬키 identity 매핑 테이블 신규 구축(P2-A.1급 별도 프로젝트)"),
    "skill": ("high", "bAutoSpell과 동일한 스킬 identity 매핑 필요"),
    "bAutoSpellWhenHit": ("high", "onDamaged 집계 인프라 자체를 P0 collector에 신규 구축해야 함"),
    "bAddEffWhenHit": ("high", "bAutoSpellWhenHit과 동일(onDamaged 인프라 신규)"),
    "bSubRace": ("high", "RC_Player_Human -- '플레이어 종족' 개념 자체를 몬스터 전투 모델에 새로 도입해야 함"),
    "bSPGainRace": ("high", "RC_Player_Human과 동일 사유"),
    "bHealPower": ("high", "healBoost 계열 자체가 P0에서 원작검증필요로 막혀 있어 상위 조사부터 필요"),
    "bHealPower2": ("high", "healBoost 계열, 위와 동일"),
    "bHealpower2": ("high", "healBoost 계열, 위와 동일"),
    "bSkillHeal": ("high", "healBoost 계열, 위와 동일"),
    "bSkillHeal2": ("high", "healBoost 계열, 위와 동일"),
    "bAddItemHealRate": ("high", "healBoost 계열, 위와 동일"),
}
DEFAULT_COMPLEXITY = ("high", "저빈도 니치 메커닉 -- 반사/파괴/즉사 등 P0에 대응 개념 자체가 없어 개별 신규 설계 필요")


def main():
    matrix = json.load(open(MATRIX_JSON, encoding="utf-8"))
    target_verdicts = {"engine-extension-required", "trigger-model-missing", "identity-mapping-gap"}

    rows = []
    for e in matrix["entries"]:
        if e["verdict"] not in target_verdicts:
            continue
        const = e["constant"]
        unlock_potential = e.get("comboCount", 0)
        complexity, complexity_reason = COMPLEXITY.get(const, DEFAULT_COMPLEXITY)
        weight = COMPLEXITY_WEIGHT[complexity]
        priority_score = round(unlock_potential / weight, 3)
        rows.append({
            "constant": const,
            "verdict": e["verdict"],
            "unlockPotentialCombos": unlock_potential,
            "engineComplexity": complexity,
            "engineComplexityReason": complexity_reason,
            "priorityScore": priority_score,
            "sampleComboIds": e.get("sampleComboIds", []),
        })

    rows.sort(key=lambda r: (-r["priorityScore"], -r["unlockPotentialCombos"], r["constant"]))

    out = {
        "meta": {
            "purpose": "combo-effect-support-matrix.json의 engine-extension-required/trigger-model-missing/identity-mapping-gap 항목을 unlockPotential/engineComplexity 우선순위로 정렬(빈도 1위가 항상 1순위는 아님)",
            "priorityFormula": "priorityScore = unlockPotentialCombos / complexityWeight(low=1,medium=2,high=3)",
            "generatedFrom": "source/data/combo-effect-support-matrix.json",
        },
        "backlog": rows,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK - wrote {OUT_JSON} ({len(rows)} rows)")
    for r in rows[:8]:
        print(" ", r["constant"], r["priorityScore"], r["engineComplexity"], r["unlockPotentialCombos"])


if __name__ == "__main__":
    main()
