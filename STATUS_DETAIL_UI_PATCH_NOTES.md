# Status detail UI — combat stats + applied effects (P1-B)

Continuation of `feat/stat-allocation-ui-p1a` (`a05619a`). P1-A(스탯 배분 UX)는 그대로 두고,
이번 단계는 캐릭터 상태창(`#char-detail`)에 **전투 능력치 누락 보완**과 **실제 적용 중인
아이템/카드 효과 표시**를 추가한다. P0에서 확정한 정본 인터페이스(`s.itemEffects.ledger/
unsupported/pending`, `s.cardXxx`, `ITEM_EFFECT_P0_CLOSEOUT.md` §15)만 읽는다 — `DB.items`를
다시 파싱하지 않고, `statCost`/`STAT_CAP` 등 P1-A 공식과 `calcStats()` 자체의 수식도 이번
단계에서 변경하지 않는다. 장비 비교 UI는 P1-C로 미룬다.

## 1. 기존 상태창 구조

`#char-detail`(PC "능력치" 버튼 / 모바일 "캐릭터" 탭 공용 1화면)의 `.stats-sec`는 P1-A까지
STR~LUK 6행(투자값+직업/장비/버프를 색으로만 구분한 인라인 표시, +1/최대 버튼) 다음에
ATK/DEF/MATK/MDEF/HIT/FLEE/CRIT/ASPD/CAST 9개 전투 능력치 행만 있었다. 누락돼 있던 것:
**PD(완전회피)**, **MaxHP/MaxSP**, **HP/SP 자연회복**(모두 `calcStats()`가 이미 계산해
`s.pd`/`s.maxHp`/`s.maxSp`/`s.hpRegen`/`s.spRegen`로 반환하지만 이 패널에는 노출되지 않고
있었다) — PD는 P0에서 실제 몬스터 공격 판정(`getOutgoingDefIgnore`류와 별개로 회피 판정에서)
소비되는 것이 확인된 값이라 필수 추가 대상이었다.

"적용 효과" 섹션은 아예 없었다. 대신 `s.statBreakdowns`/`buildStatBreakdown`류(v9.10)와
`formatBreakdownTooltip`/`showStatTooltip`/`initStatTooltips`(`[data-stat]` hover 툴팁)가
존재했지만, 이 전체가 `renderChar()`라는 죽은 렌더 경로(대상 DOM `#char-info`가 애초에
템플릿에 없음 — `$()`가 항상 진짜 엘리먼트 대신 no-op Proxy를 반환해 `target.innerHTML=h`가
아무 데도 나타나지 않는다)에만 연결돼 있었다. 즉 계산은 유효하지만 화면에 한 번도 표시된
적 없는 죽은 코드였다 — 이번 P1-B는 이 죽은 경로를 고치지 않고 그대로 두었다(범위 밖,
삭제도 하지 않음 — 계산 자체는 정상이라 위험 없는 무해한 죽은 코드).

## 2. 3층 구조

`.stats-sec`를 다음 순서로 재정리했다(`combat-sec-hdr` 소제목으로 구분):

1. **기본 능력치** — STR/AGI/VIT/INT/DEX/LUK, 각 `투자값 + 총보너스(+N) (직업+a 장비+b
   카드+c 버프+d 기타+e)`, 다음 비용, +1/최대 버튼(P1-A 그대로 유지).
2. **전투 능력치** — ATK/DEF/MATK/MDEF/HIT/FLEE/CRIT/PD/ASPD(+delay)/CAST/MaxHP/MaxSP/
   HP·SP 자연회복.
3. **적용 효과** — 공격/방어/상태/자원/발동/기능 6그룹 + 미지원(⚠) + 검증 대기 하위 섹션.

## 3. 기본 stat bonus 계산 근거

`p.str`(투자값) vs `s.str`(최종값)의 의미를 먼저 `calcStats()` 실제 코드로 확인했다:
`base.str = Number(p.str||1)`, `s.baseStr = base.str`, `totStr = base.str + jobBonusStr +
bonus.str`, `s.str = totStr`. 따라서 `총 보너스 = s.jobStr + s.bonusStr`(= `finalStat -
investedStat`, 과제 §3 공식 그대로)이고, 이 값을 새로 계산하지 않는다.

출처 분해는 새 계산기가 아니라 이미 있는 데이터의 재조합이다:
- **직업**: `s.jobStr` 등(기존 `jobBonusStr` 그대로).
- **버프**: `getSeStatBonus(p)`(기존 v9.10 표시 전용 함수, 그대로 재사용).
- **장비/카드**: `s.itemEffects.ledger`(P0 정본)에서 `type==='stat' && key===해당스탯`인
  항목을 `sourceType`(`'equipment'`/`'card'`)별로 합산 — collectItemEffects가 이미
  장비/카드를 구분해 기록해 둔 값이라 새로 나누는 게 아니라 있는 구분을 읽기만 한다.
- **기타**: `총보너스 - 장비 - 카드 - 버프`의 잔여값. 노비스 스킬 패시브(`기본 스킬`
  Lv당 전 스탯 +1) 등 ledger에도 SE에도 없는 소스가 유일한 원인이다 — "장비/카드/버프를
  임의로 나누지 마라"(과제 §4)는 지시를 지키기 위해 이 잔여분을 "패시브 스킬"이라
  단정하지 않고 "기타"로만 표시한다. 셋 다 0이면 표시하지 않는다(§4 "출처 확인 불가로
  뭉개지 말고 확보 가능한 수준까지만").
- 신규 헬퍼: `getStatBonusBreakdown(stKey, s, p)` (template.html, `getSeStatBonus` 바로 뒤).

## 4. 전투 능력치 표시 목록

ATK/MATK/DEF/MDEF/HIT/FLEE/CRIT(기존 유지, 변경 없음) + 신규 3행:

- **PD**: `<span id="stat-pd">` = `s.pd` 그대로. 라벨 "💯 완전회피(PD)", `title` 속성으로
  "일반 FLEE와 별도로 공격을 완전히 회피할 확률 판정에 사용"만 간단히 부연(정확한 확률식은
  이번에 재검증하지 않음 — 기존 구현 그대로).
- **MaxHP/MaxSP**: `s.maxHp`/`s.maxSp` + 장비/카드 보너스(`s.bonusMaxHp`/`s.bonusMaxSp`)를
  괄호 없이 파란 `+N`으로 병기(상단 HP/SP 바의 기존 표기 관례와 동일한 색 사용, 계산은
  중복하지 않음).
- **HP/SP 자연회복**: `s.hpRegen`/`s.spRegen` 그대로 — "매 틱 자동 회복량"이라는 의미가
  명확해 추가했다(과제 §6 "실제 의미가 불명확하면 추가하지 않는다"의 반대 케이스).

## 5. PD / ASPD / CAST 실제 표시 형식

- **PD**: `완전회피(PD) 7` (툴팁으로 용도만 설명, 확률식 설명 없음).
- **ASPD**: 기존 그대로 `172 (420ms)` — 표시값과 딜레이 둘 다 유지(과제 §8, 이미 P1-13부터
  구현돼 있었으므로 변경 없음).
- **CAST**: 기존 그대로 `35% 단축` 또는 `무캐스팅` — `s.castReduction`/`s.instantCast`
  기반, 변경 없음(과제 §9, 이미 구현돼 있었으므로 새로 만들지 않음).

## 6. ledger → UI 분류 규칙

`getItemEffectDisplayRows(s)`(template.html)가 `s.itemEffects.ledger`를 순회하며:

1. `active !== true` 또는 `type`이 `'pending'`/`'unsupported'`인 항목은 제외.
2. `EFFECT_HIDE_KEYS`(str/agi/vit/int/dex/luk/atk/def/mdef/maxHp/maxSp/hit/flee/crit/
   aspd/pd/maxHpPct/maxSpPct/hpRegenPct/spRegenPct) — 이미 기본/전투 능력치 합계에 그대로
   반영되는 단순 가산 효과라 중복 표시하지 않는다(과제 §13/§35).
3. `EFFECT_LEDGER_FORMATTERS`에 등록된 키만 표시한다(공격/방어/상태/자원/발동/기능 6그룹).
   등록 안 된 키는 추측 라벨을 만들지 않고 그냥 건너뛴다.
4. `_isDeferredLedgerEntry`로 `fx.unsupported`와 `source`+`sourceType`+`key` 매칭을 재확인
   — 우연히 formatter가 있는 키라도 그 인스턴스가 P0에서 보류 표시된 것이면 일반 목록에서
   빠지고 미지원 섹션으로만 간다(현재 데이터로는 7개 보류 필드에 formatter 자체가 없어
   이중 안전장치지만, 나중에 formatter가 먼저 추가되고 unsupported 마킹 제거가 늦어지는
   경우를 대비한 방어 코드).
5. 값 변환은 이 프로젝트에 이미 있는 관례만 재사용한다 — 퍼센트 필드는 "N=N%"(기존
  `atkPct`/`raceAtk`류 관례), 확률/캐스팅 감소는 기존 UI가 이미 쓰는 `*100` 표시 변환
  (예: `Math.floor(s.castReduction*100)`과 동일 계산)만 쓴다. `hpDrainSelf`처럼 실제
  소비 지점(`processTurn()`)에 별도의 `/10` 변환이 있는 값은 그 수치를 UI에서 다시
  계산하지 않고 라벨만("전투 중 자기 HP 소모") 표시한다 — 두 곳에 같은 공식을 중복
  구현해 나중에 어긋나는 것을 피하기 위함.

## 7. deferred/pending 표시 규칙

- **미지원**: `fx.unsupported` 배열을 그대로 순회해 렌더링. `_unsupportedDisplayLabel(u)`가
  라벨을 `key + ': ' + 사유` 패턴에서 앞부분 키를 추출해 `EFFECT_KEY_DISPLAY_NAME`(과제
  §17이 이름 붙인 7개 필드: magicRaceAtk/skillDmg/doubleAtkCard/healBoost/rangedDmgReduce/
  magicImmune/armorElement 전용 매핑)로 짧은 한국어 이름으로 바꾼다. 매핑에 없는 극소수
  레거시 형태(`string effect: ...`, `무기 파괴 방지`, `unknown effect.type: ...`)는 원문
  그대로 보여준다 — 새 이름을 지어내지 않는다. 접두사에 "— 현재 미지원"을 붙인다.
- **검증 대기**: `fx.pending` 개수만 "검증 대기 효과 N개"로 보여주고, 펼치면 각 항목을
  "⚠ {출처} — 효과 검증 대기"로만 표시한다(개발자 용어 노출 최소화, 이번 단계에서 실제
  데이터 검증은 하지 않음).

## 8. 모바일 처리

PC/모바일이 이미 `openCharDetail('stats')` 하나로 같은 `#char-detail` DOM과 `updateUI()`
한 경로를 공유한다는 것을 재확인했다(계산 함수는 완전히 동일, 렌더링 대상 DOM도 동일 —
분기 자체가 없다). "적용 효과" 섹션만 표시량이 길어질 수 있어 `@media(max-width:700px)`
브레이크포인트에서 `#fx-body`를 기본 접힘으로 두고(`.fx-open` 클래스가 붙으면 펼침), PC는
`.fx-body{display:block}`가 항상 적용돼 처음부터 펼쳐진다 — CSS 미디어쿼리로만 분기하고
JS 계산(`getItemEffectDisplayRows`)은 완전히 동일한 한 번의 호출 결과를 공유한다(과제 §26).
헤더 클릭(`toggleFxBody()`)/미지원·검증대기 하위 섹션 클릭(`toggleFxSub(id)`)은 순수 DOM
표시 토글이며 게임 상태를 바꾸지 않는다.

## 9. 테스트

`tests/status-detail-ui-smoke.js`(신규, 10개 테스트) — `getSeStatBonus(p){`부터
`_unsupportedDisplayLabel(u){` 끝까지 template.html 실제 소스를 그대로 추출·실행:

- 기본 stat bonus 출처 분해(과제 예시 직업+3/장비+2/카드+1/버프+1=+7 포함, 보너스 0/음수
  장비/설명 안 되는 잔여값→기타 케이스).
- PD가 실제 `calcStats().pd`와 일치(손으로 재확인한 공식과 교차 검증).
- ASPD 표시값-딜레이 관계식 불변 재확인.
- CAST의 castReduction/instantCast 실제 데이터 정합성.
- active ledger가 방어/상태/기능 3그룹에 정확히 분류(raceDmgReduce/immune/grantSkill).
- deferred 3필드(magicRaceAtk/skillDmg/healBoost)가 적용 효과 목록에 전혀 안 나타나고
  `fx.unsupported`에만 존재.
- pending 카드는 active rows 0 / pending count 1.
- 장착/해제 즉시 반영(잔류 없음).
- 단순 STR 효과 중복 표시 없음(같은 카드의 조건부 효과 bossAtk는 정상 표시로 대비 확인).
- 미지원 라벨 변환(알려진 7개는 짧은 이름, 그 외는 원문 유지).

전부 PASS. 기존 회귀 스위트(item-effects 계열 10개 + stat-allocation-ui 1개 + 신규 1개,
총 12개 JS 테스트 + `item-effect-audit-test.py`)도 전부 PASS — 이번 상태창 UI 변경이 P0
효과 시스템과 P1-A 스탯 배분 로직에 영향을 주지 않았음을 확인. `python build.py` FAIL 0 /
WARN 469(불변), P0-close 자동 게이트 2종 OK. 빌드된 HTML의 실제 JS `<script>` 16개(불변)
전부 `node --check` 통과.
