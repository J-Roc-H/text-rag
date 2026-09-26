# Equipment compare UI (P1-C)

Continuation of `feat/status-detail-ui-p1b` (`a7a2d4a`). P1-A(스탯 배분)와 P1-B(전투
능력치+적용 효과)는 그대로 두고, 이번 단계는 인벤토리/장비창에서 후보 장비를 장착 전에
"현재 장비 대비 최종 능력치 변화 + 적용 효과의 획득/소실"로 미리 보여준다.

**최우선 원칙**: 별도 장비 비교 공식을 만들지 않는다. 반드시 `현재 loadout→calcStats()`
vs `후보 loadout(clone)→calcStats()` 두 결과를 그대로 diff한다. 상점(`showShopModal`)은
이번 범위 밖 — 기존 `getEquipCompareHtml()`을 그대로 둔다.

## 1. 현재 장착 흐름

`equipItem(k)`(template.html)이 실제 장착의 유일한 진입점임을 확인:
- `parseItem(k)`로 베이스 아이템(`i`)을 얻는다. `k`는 "+N 베이스명 [슬롯수] <카드1, 카드2>"
  형태의 인벤토리 키 문자열 자체이고, 제련/카드가 이미 인코딩돼 있다.
- 무기는 직업 허용 무기타입(`JOB_WEAPON_ALLOW`)과 최소 티어(`WEAPON_LV_MIN_TIER`/`JOB_TIER`)를
  먼저 검사 — 불허 시 로그만 남기고 종료(장착 안 됨).
- 슬롯 결정: `i.type`이 곧 슬롯 키(예: '무기','갑옷'). 단 `Accessory`(대문자, DB 표기)는
  악세1이 비어 있으면 악세1, 아니면(이미 채워져 있으면 — 악세2가 비었든 찼든) 악세2 — 사용자가
  고르는 구조가 아니라 완전히 결정적이다.
- 양손무기(창/활/양손검/양손도끼/양손봉)를 '무기' 슬롯에 걸면 '방패'를 자동 해제한다.
- `showItemDetail(n)`(인벤토리 아이템 클릭)과 `openEquipModal(sl)`(장비창 슬롯 클릭 → 후보
  목록 → 행 클릭 시 다시 `showItemDetail`)이 실제 장착 UI의 유일한 두 진입점이며, 결국 같은
  모달로 수렴한다 — 비교 UI를 붙일 지점은 여기 하나뿐이다.
- `showItemDetail`은 이미 `getEquipCompareHtml(candidateKey, it)`(P2-09, ATK/MATK/DEF/MDEF/
  HIT/FLEE/CRI/HP/SP 9개만 비교하는 축약형)을 쓰고 있었다 — 상점 구매 상세와 공용. 이
  기존 함수는 **악세서리를 `it.type`(='Accessory') 그대로 슬롯 키로 써서 실제 슬롯(악세1/
  악세2)과 다른 자리에 임시 장착하는 버그**가 있었다(장비 비교 산출값이 실제 장착과 달라질
  수 있는 사례) — 이번 P1-C가 그 자리를 대체한다(§4).

## 2. 후보 calcStats 계산 방식

`calcStats()` 본문 전체를 조사한 결과 `G.player`를 직접 읽는 곳은 최상단
`let p=G.player;` 단 한 줄뿐이었다(그 아래는 전부 지역변수 `p`만 사용, `collectItemEffects
(p, DB, parseItem)`도 `p`를 인자로 받는다). 이는 **Option A(인자 추가)가 안전하다**는
뜻이라 그렇게 했다:

```js
function calcStats(playerOverride){
  let p = playerOverride || G.player;
  if(!p) return {};
  ...
}
```

기존 0-인자 호출부는 전부 그대로 동작한다(회귀 스위트 전체 PASS로 확인). `calcStats(clone)`을
호출하면 clone의 `weaponType`/`weaponElement`(계산 중 유일하게 mutate되는 필드, §3)만
바뀌고 `G.player`는 전혀 건드리지 않는다. (참고: `buildMaxHpBreakdown`/`buildMaxSpBreakdown`
내부가 `G.player?.job`을 직접 읽는 예외가 하나 있으나, 장비 비교는 직업을 바꾸지 않으므로
`G.player.job`과 clone의 job이 항상 같아 영향이 없다 — 이번 기능의 `s.statBreakdowns`는
애초에 죽은 렌더 경로에만 쓰이므로 결과에도 관여하지 않는다.)

## 3. 원본 state 격리 방식

```js
function _cloneLoadoutForComparison(p){
  let clone = Object.assign({}, p);
  clone.equip = Object.assign({}, p.equip || {});
  return clone;
}
```

calcStats 조사(§2) 결과 mutate되는 필드는 player 최상위(`weaponType`/`weaponElement`)와
`equip`뿐이었다 — `statusEffects`/`inventory`/`skills`/`mount`는 읽기만 하므로 원본을 그대로
공유해도 안전하다(과도한 범용 deep-clone을 만들지 않았다). `G.player` 자체는 전혀 건드리지
않고, 실제 `calcStats()`(현재)와 `calcStats(clone)`(후보)를 각각 한 번씩만 호출한다.

## 4. slot / 양손 / 복수 슬롯 처리

equipItem() 내부의 판정 로직을 **그대로 옮겨서** 공유 helper 2개로 추출했다(새 규칙 없음,
코드 이동):

```js
function resolveEquipSlot(p, i){ /* 직업/티어 제한 + 악세1/2 자동배정, equipItem()과 동일 */ }
function applyCandidateEquip(equip, targetSlot, itemKey, i){ /* 슬롯 교체 + 양손무기→방패 해제 */ }
```

`equipItem()` 자신도 이 두 함수를 호출하도록 리팩터했다(로그 문구·순서 전부 동일 — 회귀
테스트로 확인). `getEquipmentComparison()`이 같은 함수를 그대로 재사용하므로 "비교는 장착
가능하다고 계산했는데 실제 equipItem은 거부"하는 불일치가 구조적으로 생길 수 없다. 악세서리
2슬롯은 이미 결정적(악세1 우선, 차있으면 악세2)이라 사용자 선택 UI가 없고, 비교도 그 결정된
슬롯 하나만 보여준다(임의로 악세1 고정 안 함). 양손무기 장착 시 방패 자동 해제는
`applyCandidateEquip`이 후보 loadout에도 동일하게 반영하고, `getEquipmentComparison`의
반환값(`shieldRemoved`)으로 UI에 안내 문구를 띄운다.

## 5. 수치 diff 목록

```js
const EQUIP_COMPARE_STAT_FIELDS = [
  ['STR','str'], ['AGI','agi'], ['VIT','vit'], ['INT','int'], ['DEX','dex'], ['LUK','luk'],
  ['ATK','totalAtk'], ['MATK','totalMAtk'], ['DEF','hardDef'], ['MDEF','hardMDef'],
  ['HIT','hit'], ['FLEE','flee'], ['CRIT','crit'], ['PD','pd'],
  ['MaxHP','maxHp'], ['MaxSP','maxSp'], ['HP 자연회복','hpRegen'], ['SP 자연회복','spRegen'],
];
```

DEF/MDEF는 `hardDef`/`hardMDef`(장비/카드 기여분)만 diff한다 — `softDef`(=VIT)는 이미 VIT
행에서 다뤄지므로 중복이다(P1-B의 `#stat-def` 표시 관례 `softDef+hardDef` 분리와 동일 원칙).
변화 없는(diff===0) 항목은 목록에서 뺀다. ASPD(`aspdDisplay`+`aspdDelay`)와 CAST
(`castReduction`+`instantCast`)는 형식이 달라 별도 필드(`aspdDiff`/`castDiff`)로 처리한다
(§6). 색상 판정: 일반 지표는 증가=긍정(초록)/감소=부정(빨강), ASPD 딜레이만 감소=긍정으로
반대 처리한다(`_eqCmpDiffSpan(diff, goodWhenPositive)`) — 새 색은 하드코딩하지 않고 기존
`var(--green)`/`var(--red-light)`만 쓴다. "이 장비가 더 좋습니다" 같은 종합 판정은 만들지
않는다 — 수치와 효과 변화만 보여준다.

## 6. ledger semantic diff 방식

P1-B의 `getItemEffectDisplayRows(s)`를 **단일 ledger entry → 표시행**(`_ledgerEntryRows`)과
**전체 효과 → 그룹 표시**(그 결과를 그룹화)로 분리 리팩터했다(과제 §35, 새 두 번째 formatter
를 만들지 않음). 새 `getItemEffectAtomicRows(s)`가 두 곳(P1-B 상태창, P1-C 비교)에서
공유된다. 각 atomic row는 `identity`를 갖는다:

- 단일값 키(atkPct/bossAtk/defIgnore/dmgReduceAll/spCostMul/castReduction/hpDrainSelf/
  lifesteal/hpDrain/spDrain/inflict/dropBonus) → identity = key 그대로.
- 맵값 키(raceAtk/elemAtk/sizeAtk/raceDmgReduce/elemReduce/grantSkill) → identity =
  `key:서브키`(예: `raceAtk:인간형`).
- 이벤트 키(immune/raceBonus/seProc/autoSpell/soulgain) → identity = `key:조건값`(예:
  `immune:freeze`, `raceBonus:천사형`).

**identity에 `source`(카드/장비 이름)는 넣지 않는다** — "히드라 카드 +20% → 다른 카드
+20%"는 실제 효과 기준 무변화여야 한다는 과제 §18 지시에 따름. `sourceType`(장비/카드)도
넣지 않았다(같은 key+조건이면 출처 유형이 달라도 게임 효과는 동일하다고 판단).

`getItemEffectDiffRows(currentStats, candidateStats)`가 current/candidate 양쪽의 atomic
rows를 identity로 매칭한다: candidate에만 있으면 gained, current에만 있으면 lost, 둘 다
있는데 라벨 문자열이 다르면 changed(from/to 둘 다 보존 — "인간형 피해 +10% → +20%"처럼
한 줄로 표시). unsupported/pending은 값 identity가 아니라 `diffBySourceKey`(source+label 또는
source+reason 집합 diff)로 따로 처리한다 — 후보에만 있는 unsupported/pending만 보여준다.

## 7. unsupported/pending 처리

- 후보에만 있는 unsupported 항목(`gainedUnsupported`)은 P1-B의 `_unsupportedDisplayLabel`
  을 그대로 재사용해 "⚠ 새 장비 효과 중 현재 미지원 — {짧은 이름} — 현재 미지원"으로
  보여준다. 절대 gainedEffects(일반 이득)에 섞이지 않는다 — `getItemEffectAtomicRows`가
  애초에 deferred 필드용 formatter를 갖고 있지 않아 gained 집합에 나타날 수 없고, 설령
  나중에 formatter가 추가돼도 `_isDeferredLedgerEntry` 재확인이 이중 안전장치가 된다.
- 후보에만 있는 pending 항목(`gainedPending`)은 개수만 "⚠ 검증 대기 효과 N개"로 보여준다
  (수치를 추측하지 않는다).

## 8. 실제 equip parity 결과

`tests/equipment-compare-smoke.js`의 §43(E2E)이 다음을 한 번에 검증한다: `getEquipmentComparison`
호출 전후 `p.equip`/`hp`/`sp`/`statusEffects` 완전 동일(원본 불변) → 실제 `equipItem(후보)`
실행 → `calcStats()` 결과의 STR~LUK/ATK/MATK/DEF/MDEF/HIT/FLEE/CRIT/PD/ASPD(+delay)/
CAST(+instantCast)/MaxHP/MaxSP 전 필드가 `candidateStats`와 완전 일치 → active ledger의
`type:key:value` 조합 집합(semantic set)까지 완전 일치. 전부 PASS.

## 9. 모바일 처리

비교 박스(`.eqcmp-box`)는 P1-B의 `.fx-body` 패턴을 그대로 재사용했다 —
`@media(max-width:700px)`에서 `.eqcmp-body`가 기본 접힘(`.eqcmp-open` 클래스가 붙으면
펼침), PC(`>700px`)는 `.eqcmp-body{display:block}`가 항상 적용돼 처음부터 펼쳐진다.
헤더에 "변화 N개 · 효과 +A/-B · 미지원 C" 요약을 항상 보여주고, 클릭(`toggleEqCmpBody`)은
순수 DOM 토글이라 계산(`getEquipmentComparison`)은 PC/모바일이 완전히 동일한 한 번의
호출 결과를 공유한다.

## 10. 테스트

`tests/equipment-compare-smoke.js`(신규, 10개 테스트) — `_item-effect-harness.js`에 추가한
`makeEquipmentCompareApi(DB, G)`가 template.html의 `getSeStatBonus`~`_unsupportedDisplayLabel`,
`JOB_WEAPON_ALLOW`~`equipItem()`, `_cloneLoadoutForComparison`~`getEquipmentComparison`을
실제 소스 텍스트 그대로 추출·실행(재구현 아님):

- §36 단순 장비 ATK diff, 실제 equip 후 값과 일치.
- §37 STR/FLEE/PD/MaxHP/ASPD 복합 효과 diff 전부 실제 calcStats와 일치.
- §38 카드 장착 장비 — DEF 숫자 diff + raceDmgReduce gained 정확(출처 표시 포함).
- §39 deferred(magicRaceAtk)는 gainedEffects에 안 나타나고 unsupported로만.
- §40 pending 카드 — 검증 대기 1건, numeric diff 0.
- §41 같은 장비로 비교 시 변화 없음(모든 diff 0/빈 배열).
- §42 빈 슬롯 → 후보 장착 parity.
- §43 실제 equip parity E2E(§8 참조) + 원본 state 불변.
- 장착 불가(직업 무기 제한) — blocked=true, 숫자 diff 자체를 만들지 않음.
- 양손무기 장착 시 방패 자동해제가 비교/실제 장착 모두 동일(DEF -10 반영, `shieldRemoved`).

전부 PASS. 기존 회귀 스위트(item-effects 계열 10개 + stat-allocation-ui + status-detail-ui,
총 13개 JS 테스트) + `item-effect-audit-test.py`도 전부 PASS — `calcStats`/`equipItem`
리팩터가 기존 동작을 조금도 바꾸지 않았음을 확인. `python build.py` FAIL 0 / WARN 469
(불변), P0-close 게이트 2종 OK. 빌드된 HTML의 실제 JS `<script>` 16개(불변) 전부
`node --check` 통과.
