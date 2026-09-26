# Shop equipment comparison canonicalization (SHOP비교)

Continuation of `audit/status-ui-p1-close`(`dd59412`). 이 트랙은 P1 연장이 아니다 — P1
종료감사(`STATUS_UI_P1_CLOSEOUT.md` §8)에서 분리된 **SHOP backlog A** 하나만 해결한다:
상점의 구형 `getEquipCompareHtml()` 장비 비교를 제거하고, 인벤토리와 상점이 완전히 같은
`getEquipmentComparison()`/`renderEquipmentCompareHtml()`(P1-C 정본)을 쓰게 만든다.

## 1. 구형 함수 문제

`getEquipCompareHtml(candidateKey, it)`(P2-09)는 `let slot=it.type;`로 슬롯을 결정했다.
악세서리(DB 표기 `'Accessory'`)는 실제 슬롯이 `'악세1'`/`'악세2'`인데, 이 함수는 그 변환을
전혀 하지 않고 `p.equip['Accessory']=candidateKey`라는 **존재하지 않는 키**에 후보를
임시로 넣었다. 두 악세서리 슬롯이 이미 둘 다 차 있는 상태에서 세 번째 후보를 비교하면,
실제로는 `악세2`가 교체돼 그 자리의 아이템 효과가 사라져야 하는데 이 구형 함수는 세
번째 아이템을 단순히 "추가"하는 것처럼 계산해 손실분(예: AGI 효과)을 diff에서 완전히
놓쳤다 — P1-close가 발견한 정확히 그 버그.

## 2. 호출관계

전수 확인 결과 `getEquipCompareHtml`의 호출부는 **정확히 1곳**(`renderShopBuyDetail`,
상점 구매 상세)뿐이었다. `showItemDetail`(인벤토리/장비창)은 P1-C에서 이미
`renderEquipmentCompareHtml`로 교체돼 있었다 — 즉 이 버그는 상점에만 남아 있었고 P1-C의
정본 경로를 오염시키지 않았다(P1-close의 판정 그대로 재확인).

## 3. 정본 비교 경로

`renderShopBuyDetail`의 호출을 그대로 바꿨다:

```js
// before
let cmpHtml = SHOP_EQUIP_TYPES.includes(it.type) ? getEquipCompareHtml(itemName, it) : '';
// after
let cmpHtml = SHOP_EQUIP_TYPES.includes(it.type) ? renderEquipmentCompareHtml(itemName, it) : '';
```

`getEquipCompareHtml` 함수 자체를 **삭제**했다(§5의 이상적인 결과 그대로 달성) — 계산
책임이 인벤토리/상점 어디서든 `getEquipmentComparison()` 하나뿐이다. 새 stat 공식은
추가하지 않았다: `resolveEquipSlot`/`applyCandidateEquip`(equipItem()과 완전히 같은
코드)로 슬롯을 정하고, `calcStats()`(현재) vs `calcStats(clone)`(후보)의 diff만 쓴다 —
P1-C가 이미 구현해 둔 그대로다.

## 4. 악세서리 버그 수정 결과

새 경로(`getEquipmentComparison`이 호출하는 `resolveEquipSlot`)는 실제 `equipItem()`과
동일한 규칙(악세1이 비었으면 악세1, 아니면 악세2)을 그대로 쓴다. 두 슬롯이 이미 찬
상태에서 세 번째 상점 후보를 비교하면 정확히 악세2 교체로 판정되고, 사라지는 효과
(AGI 등)까지 diff에 정확히 나타난다(`tests/shop-equipment-compare-smoke.js` 시나리오 C).

## 5. 상점 후보 표현

전수 확인 결과 `renderShopBuyDetail(itemName)`은 `DB.items[itemName]`을 **직접** 조회한다
— 상점이 파는 아이템은 항상 순수 베이스 아이템명(제련 접두/카드 소켓 표기 없음)이다.
즉 상점 후보에는 제련·카드가 원천적으로 존재하지 않으므로, "후보 문자열에 제련/카드가
있는데 인벤토리에 없다"는 케이스 자체가 상점에는 없다 — 별도 후보 표현 처리가 필요
없었다(§6 최소수정 검토 결과: **수정 불필요**).

`getEquipmentComparison`/`applyCandidateEquip`은 원래부터 `p.inventory`를 전혀 참조하지
않는다(둘 다 순수하게 `candidateKey` 문자열 + item def만으로 계산한다) — "인벤토리에
없어도 계산 가능"이라는 상점의 요구사항은 P1-C 구현 당시부터 이미 충족돼 있었다. 실제로
`getEquipmentComparison('반지A', ...)`을 `p.inventory`에 `반지A`가 없는 상태로 호출해도
정상 동작하고 `p.inventory` 자체를 건드리지도 않음을 테스트로 확인했다(§7 G).

## 6. 실제 equip parity

`tests/shop-equipment-compare-smoke.js` 시나리오 F/C가 확인: 상점에서 계산한
`cmp.candidateStats`가, 그 아이템을 실제로 인벤토리에 넣고(`p.inventory[k]=1`)
`equipItem(k)`를 호출한 뒤의 실제 `calcStats()` 결과와 완전히 일치한다.

## 7. 테스트

`tests/shop-equipment-compare-smoke.js`(신규, 7개) — 모든 시나리오에서 후보를
`p.inventory`에 절대 넣지 않은 상태로 `getEquipmentComparison`을 호출한다(실제 상점
구매 전 상태 그대로):

- **A**: 악세 두 슬롯 다 빈 상태 → 악세1로 정확히 판정.
- **B**: 악세1만 사용 중 → 악세2로 정확히 판정.
- **C**(구형 버그 회귀): 악세1/악세2 모두 사용 중 → 실제 규칙대로 악세2 교체로 판정,
  사라지는 반지B의 AGI-4까지 diff에 정확히 나타남, 실제 구매+장착 후 parity 확인.
- **D**: 양손무기 상점 후보 → 방패 자동해제(DEF-10)가 diff에 반영, 실제 장착과 parity.
- **E**: 직업 제한 상점 후보 → `blocked:true`, `statDiffs` 자체가 생성되지 않음(장착
  가능한 것처럼 보이지 않음).
- **F**: 일반 장비 — 상점 비교 예측과 구매 후 실제 장착 결과 완전 일치.
- **G**: `getEquipmentComparison`+`renderEquipmentCompareHtml` 호출 전후 `p.equip`/
  `p.inventory`/`hp`/`sp`/`statusEffects`/`weaponType`/`weaponElement` 완전 불변.

`tests/_item-effect-harness.js`의 `makeEquipmentCompareApi`가 추출하는 소스 범위를
`renderEquipmentCompareHtml`/`toggleEqCmpBody`까지 넓혀(구형 함수 삭제로 기존 끝 마커가
사라져 `function shopEquipQuickHint(it){`로 교체) 상점 테스트에서도 실제 렌더러를 그대로
실행할 수 있게 했다(재구현 아님).

전부 PASS. 기존 회귀 스위트(item-effects 계열 10개 + stat-allocation-ui + status-detail-ui
+ equipment-compare + status-ui-p1-close, 총 15개 기존 파일) + `item-effect-audit-test.py`
전부 PASS — 구형 함수 삭제/호출부 교체가 다른 어떤 기능도 건드리지 않았음을 확인.
`python build.py` FAIL 0 / WARN 469(불변), P0-close 게이트 2종 OK. 빌드된 HTML의 실제
JS `<script>` 16개(불변) 전부 `node --check` 통과.

`shopEquipQuickHint`(목록용 초저비용 힌트, ATK/DEF 1개만 대략 표시)는 이번에 건드리지
않았다 — 악세서리는 원래도 이 함수에서 힌트가 안 뜨는 것으로 되어 있었지 계산이 틀린 게
아니고(`it.type`이 항상 `'Accessory'`라 `p.equip['Accessory']`가 항상 undefined → 조용히
빈 문자열 반환), 상세 영역의 정본 비교와 별개인 "저비용 근사치"로 이미 문서화돼 있어
이번 SHOP backlog A(정확도 버그)와는 다른 성질이다 — 상점 UI 전면개편은 이번 범위 밖.
