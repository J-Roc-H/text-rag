# COMBO_IDENTITY_COLLISION_AUDIT.md — P2-A.6 identity collision 감사

P2-B(콤보 matcher/runtime 연결)는 이 작업 동안 보류한다. combo-engine.js는 P2-B1에서
이미 구현·연결됐지만, 그 matcher가 소비하는 `db-combos.json`의 identity 정합성 자체에
구멍이 있었다는 것이 이번 감사로 드러나 먼저 정정한다. 이 문서는 최초 감사(1차)와
Claude 보완 지시로 추가된 2차 감사(전체 variant 대상 확장)를 모두 반영한 최종본이다.

## 1. 문제

`combo-item-identity.json`(P2-A.1)은 각 rAthena AegisName을 독립적으로 TextRAG
textragKey 1개에 매핑한다(1:1 exact match, fuzzy 금지). 그런데 rAthena 자체에 "이름이
같고 장착 슬롯도 같은" 레거시 아이템 쌍이 존재해서, 서로 다른 AegisName 두 개가
TextRAG에서는 같은 표시명 하나로 합쳐지는 경우가 있다. 이 경우 콤보 variant 2개가
"TextRAG identity 기준"으로는 완전히 같은 요구 아이템 집합이 되어, 실제 게임에서는
있을 수 없는 "같은 슬롯의 두 alias를 동시에 장착"한 것처럼 콤보 matcher가 착각할 수
있다. P2-B1은 이 경우를 "rAthena variant 독립 중첩" 원칙(정당한 원칙 자체는 맞다 —
§3.1 참조)으로 잘못 처리해 원작에 없는 이중 적용을 만들었다.

**주의(정정)**: "두 AegisName이 같은 슬�션 alias"라는 것이 "두 아이템이 완전히 동일한
아이템"이라는 뜻은 아니다. §3.2/§3.4에서 보듯 서바이버로드 쌍은 자체 능력치(Script)가
서로 다르다 — 판정 근거는 오직 "Locations(장착 슬롯)가 같아서 동시 장착이 물리적으로
불가능하다"는 것뿐이다.

## 2. 조사 방법(1차 + 2차)

1. `combo-item-identity.json`의 verified 항목(aegisName→textragKey) **225개**(전체
   278개 항목 중 status=="verified"인 것만 — ambiguous/unresolved-existing/missing은
   제외)를 역매핑해 하나의 textragKey에 복수 aegisName이 매핑된 경우를 전수 조사
   (추측/표본 아님).
2. 발견된 각 충돌 쌍에 대해 rAthena `db/pre-re/item_db_equip.yml`(pin
   `e985006171d2eb320ee512a653f4c83aea3d81b6`) 실코드를 직접 대조 — Type/Locations/
   Jobs/Defense·Attack/**자체 Script**/Slots를 항목별로 비교.
3. (1차) `db-combos.json`의 156개 variant 전체에서, 이 충돌 aegis 쌍이 실제로 **같은
   source entry 안** 두 variant를 "TextRAG identity 기준 완전 동일"로 만드는지 확인.
4. (2차, 보완 지시) 1차는 검출 범위를 같은 source entry 내부로만 한정해 **entry 12/14
   처럼 서로 다른 entry가 같은 collision item을 공유하는 경우를 놓쳤다.** 검출을
   entry 경계와 무관한 **전체 variant 대상**으로 확장했다 — 단, 단순 textragKey 동일성
   만으로 병합하지 않고, 그 동일성이 반드시 §3.2의 등재된 exclusive-alias 쌍 때문이라는
   증거가 있을 때만 인정한다(일반 dedup 금지 원칙은 그대로 유지).

## 3. 결과

### 3.1 rAthena variant 독립 중첩 원칙 자체는 유효(재확인)

`ComboDatabase::parseBodyNode`(itemdb.cpp)는 하나의 `Combos:` 블록 안 각 `Combo:`
variant를 완전히 독립된 `s_item_combo` 레코드로 등록하고, `pc_checkcombo`/
`status_calc_pc`는 variant마다 독립적으로 매칭·`run_script`한다(동일 id 재등록만 막고
다른 id 간 dedup 없음) — 이 자체는 P2-B1이 이미 정확히 확인한 사실이며 바뀌지 않는다.
문제는 이 원칙이 아니라, TextRAG의 identity collapse가 원작에서는 불가능한 상황을
"동시 만족"으로 잘못 재현한 것이다.

### 3.2 발견된 충돌: 6개 textragKey(전수, 역매핑 기준)

| textragKey | AegisName 쌍 | equip slot 근거(exclusive-alias 판정) |
|---|---|---|
| 매직코트 | Mage_Coat / Mage_Coat_ | 둘 다 Type=Armor, Locations.Armor=true, Jobs·Defense·자체 Script(bMdef+5,bInt+1) 동일, 차이는 Slots(무/유 1) — 사실상 완전 동일 |
| 닌자슈츠 | Ninja_Suit / Ninja_Suit_ | Armor, Locations.Armor, Jobs·Defense·자체 Script(bAgi+1,bMdef+3) 동일, Slots만 차이 — 사실상 완전 동일 |
| 아머 | Padded_Armor / Padded_Armor_ | Armor, Locations.Armor, Jobs(9종)·Defense 동일, Slots만 차이 — 사실상 완전 동일 |
| 서바이버로드 | Survival_Rod_ / Survival_Rod2_ | Weapon/Staff, Locations.Right_Hand, Jobs·Attack·Range·WeaponLevel·Slots 동일 **이지만 자체 Script는 다르다**(Survival_Rod_: bDex+3/bMatkRate+15, Survival_Rod2_: bInt+3/bMatkRate+15 — 이름은 같은 'Survivor's Rod'지만 DEX/INT 두 파생 무기) |
| 런닝셔츠 | Undershirt / Undershirt_ | Armor, Locations.Garment, Defense·자체 Script(bMdef+1) 동일, Slots만 차이 — 사실상 완전 동일 |
| 롱혼 | Long_Horn / Long_Horn_M | Weapon/1hSpear, Locations.Right_Hand, Jobs·Attack·Range·WeaponLevel 동일, `_M`만 Trade 제한(결혼 지급용 추정) — 사실상 완전 동일 |

**exclusive-alias 판정(같은 equip location이라 동시 장착 불가) 자체는 6종 전부에서
성립한다.** 판정의 근거는 항상 `Locations` 필드(장착 슬롯)만이며, 아이템 자체의
동일성(자체 Script)까지는 함의하지 않는다 — 서바이버로드가 그 차이를 보여주는
사례다. "구분할 정보 자체가 없는" 판정 3 사례(어느 collision key가 exclusive-alias
인지조차 확인 못한 경우)는 없었지만, **같은 collision key라도 그것이 콤보에 나타나는
방식에 따라 처리(canonical 선택 가능 여부)가 달라진다** — §3.4 참조.

### 3.3 실제 콤보에 나타난 충돌 — entry 경계 무관 전체 스캔(2차, 최종)

콤보 156개 variant 전체를 대상으로 위 6종 collision key를 참조하는 모든 variant를
모아 requiredItems(textragKey multiset) 기준으로 다시 그룹화한 결과, **8개 그룹**이
나온다(1차 감사는 같은 entry 안 pair만 봐서 7개로 과소 집계했다 — entry 12/14 cross-
entry pair를 놓쳤다).

| 그룹 | source entry | variant | rawScript 비교 | 판정 |
|---|---|---|---|---|
| 1 | 9 | 0009-01(Mage_Coat) / 0009-02(Mage_Coat_) | 완전 동일 | case 2(canonical) |
| 2 | 13 | 0013-01(Survival_Rod_) / 0013-02(Survival_Rod2_) | 완전 동일 | case 2(canonical) |
| 3 | **12 + 14(cross-entry)** | 0012-01(Survival_Rod_+생존의망토) / 0014-01(Survival_Rod2_+생존의망토) | **다름**(0012-01: `min()` 래핑 / 0014-01: `if/else`) | **case 3(canonical 없음)** |
| 4 | 34 | 0034-01(Padded_Armor) / 0034-02(Padded_Armor_) | 완전 동일 | case 2(canonical) |
| 5 | 35 | 0035-01(Ninja_Suit) / 0035-02(Ninja_Suit_) | 완전 동일 | case 2(canonical) |
| 6 | 36 | 0036-01(Pantie+Undershirt) / 0036-02(Pantie+Undershirt_) | 완전 동일 | case 2(canonical) |
| 7 | 36 | 0036-03(삼각팬티+Undershirt) / 0036-04(삼각팬티+Undershirt_) | 완전 동일 | case 2(canonical), 6번과는 **별개 그룹**(4-way 아님) |
| 8 | 2 | 0002-01(Long_Horn+발키리아쉴드) / 0002-02(Long_Horn_M+발키리아쉴드) | 완전 동일 | case 2(canonical), 둘 다 이미 unsupported라 runtime 영향 없음 |

entry 36은 `G_Strings`(→'Pantie')와 `G_Strings_`(→'삼각팬티')가 서로 다른
textragKey로 남아 있어(이 둘은 이번 충돌 감사 대상이 아님 — 별개 identity 판단이라
이번 범위 밖) 4개 variant가 하나로 뭉쳐지지 않고 **독립된 두 그룹(6, 7)**으로 정확히
분리된다. "source entry 단위 일반 dedup" 금지 원칙이 여기서 실제로 검증된다.

entry 3(0003-01, Long_Horn 단독 참조)은 짝이 되는 variant가 없어 충돌이 실제로
나타나지 않으므로 identityCollision 주석이 붙지 않는다.

### 3.4 entry 12/14 — 왜 case 3(canonical 선택 금지)인가

0012-01(entry 12)과 0014-01(entry 14)은 requiredItems가 TextRAG identity 기준으로
완전히 같다(서바이버로드 + 생존의망토, 둘 다 `Clack_Of_Servival`). 하지만 두 combo의
`rawScript`는 다르다:

```
0012-01(Survival_Rod_ 전용): bonus bMaxHP,300;
  bonus bMatkRate,min(5, getequiprefinerycnt(EQI_HAND_R)-5);
  bonus2 bSubEle,Ele_Neutral,min(30, getequiprefinerycnt(EQI_GARMENT)*3);

0014-01(Survival_Rod2_ 전용): bonus bMaxHP,300;
  bonus bMatkRate,getequiprefinerycnt(EQI_HAND_R)-5;
  if (getequiprefinerycnt(EQI_GARMENT) > 10) { bonus2 bSubEle,Ele_Neutral,30; }
  else { bonus2 bSubEle,Ele_Neutral,getequiprefinerycnt(EQI_GARMENT)*3; }
```

즉 원작에서는 플레이어가 실제로 가진 물리 아이템이 Survival_Rod_인지 Survival_Rod2_
인지에 따라 **적용되는 보너스 자체가 다르다**(각 script가 상한 처리 방식도 다르다).
TextRAG는 이 둘을 구분할 정보가 없으므로(같은 "서바이버로드"로만 표시), 둘 중 하나를
canonical로 골라 적용하는 것은 원작의 약 50%를 틀리게 재현하는 도박이다. 그래서 이
그룹은 §3.3의 다른 7개 그룹(case 2, script가 완전히 같아 canonical을 골라도 결과가
같은 경우)과 다르게 취급한다: **canonical을 고르지 않는다.**

지금 당장은 두 variant 모두 다른 사유(동적 표현식 `getequiprefinerycnt`/`min`/`if-else`
미지원)로 이미 `unsupported`이므로 실행에 영향이 없다. 하지만 이 상태를 데이터에
`identityCollision.role: "ambiguous-no-canonical"` + `futurePromotionBlock: true`로
명시적으로 남겨 둔다 — 훗날 동적 표현식 지원이 추가돼 둘 중 하나(또는 둘 다)가
"원래대로라면 verified가 될" 상황이 오면, `resolve_global_identity_collisions()`가
재생성 시점마다 항상 이 조건을 재평가해 **관련된 전부를 즉시 runtime-blocked로
강등**한다(합성 데이터로 F-1/F-2 테스트가 이 동작을 직접 검증한다 — 하나만
otherwise-verified여도, 둘 다 otherwise-verified여도 결과는 동일하게 전부 차단).

## 4. 판정과 구현

**exclusive-alias 판정(슬롯 근거) 자체는 6종 전부. 그러나 콤보 레벨 처리는 script
동일 여부로 갈린다**: case 2(script 동일, 7개 그룹, canonical 선택) / case 3(script
다름, 1개 그룹 — entry 12/14, canonical 선택 금지). "구분할 정보 자체가 없는" 순수
판정 3(collision key 자체가 미등재) 사례는 없었다.

구현은 `tools/canonicalize_combos.py`에 있다(runtime matcher가 아니라 데이터 생성
단계에서 해소 — matcher 쪽에 "textragKey가 같으면 dedup" 같은 일반 규칙을 추가하지
않았다):

- `IDENTITY_COLLISION_JUDGMENTS`: 위 6개 쌍 + 근거를 하드코딩한 표(추측 금지 — 새 충돌이
  나타나면 `audit_identity_collision_coverage()`가 즉시 raise, 개별 조사 후 등재해야만
  통과). 판정 필드는 "이 슬롯이 exclusive-alias인가"만 다루고, script 동일 여부는
  다루지 않는다(그건 그룹마다 동적으로 비교한다).
- `compute_identity_collisions()`: identity map 역매핑 전수 조사(225개 verified 항목
  기준).
- `resolve_global_identity_collisions()`(2차 — entry 경계 없이 **전체 combos**를
  대상으로 한 번에 실행): requiredItems가 textragKey multiset 기준으로 완전히
  같아진 그룹을 전체 variant에서 찾는다(동일 entry든 cross-entry든 무관). 그 동일성이
  등재된 aegis 쌍 때문일 때만 인정한다(§금지: 단순 textragKey dedup). 그 다음 그룹의
  `rawScript`가 전부 같은지 확인해 case 2/3로 분기한다:
  - case 2: canonical(가장 작은 id) 하나만 verified 유지, 나머지는 verified였을 때만
    `runtime-blocked`로 낮춘다.
  - case 3: canonical을 고르지 않는다(`canonicalId: null`). 그룹 중 하나라도(원래대로
    라면) verified였다면 **전부** `runtime-blocked`로 낮춘다.
  모든 관련 variant에 `identityCollision`(role/canonicalId/memberIds/
  collisionTextragKeys, case 3은 `futurePromotionBlock: true` 추가) 메타데이터를
  남긴다.

`source/combo-engine.js`(matcher)에는 이 collision 해소를 위한 별도 로직을 추가하지
않았다 — 기존 `status !== 'verified'` 필터가 duplicate/ambiguous를 자동으로 걸러낸다.
대신 요청받은 다른 두 가지 방어를 추가했다:

- `matchCombos`에 `requiredItems.isAmmo === true` 하드 블록 추가(activeAmmo 정본 전까지
  무조건 false — `getActiveLoadout`이 애초에 ammo를 수집 안 하는 구조적 방어와는 별개인
  명시적 두 번째 방어선).
- ledger 항목에 `source`(기존)와 별개로 `sourceId`(combo.id, 안정 식별자) 필드 추가.

## 5. 재산출된 집계 (156 variant 전체 불변)

| status | 정정 전(P2-B1 종료 시점) | 정정 후(최종) |
|---|---|---|
| verified | 47 | **41**(-6) |
| runtime-blocked | 0 | **6**(+6, identity collision case 2 duplicate 전량; case 3은 현재 둘 다 이미 unsupported라 0건; ammo 유래도 현재 0건) |
| unsupported | 51 | 51(불변) |
| source-needed | 58 | 58(불변) |

`identityCollisionGroupCount`는 **8**(case 2 그룹 7개 + case 3 그룹 1개), 관련
variant 수는 16개(그룹당 2개 × 8). `combo-effect-support-backlog.json`/
`combo-effect-support-matrix.json`/`combo-engine-extension-backlog.json`은 재생성해
diff한 결과 **바이트 단위로 무변화**(전부 `effects`/`unsupportedEffects` 기준으로만
집계하고 이번에 바뀐 `status`/`identityCollision` 필드는 참조하지 않는다).

## 6. 테스트

- `tests/combo-identity-collision-audit-test.py`(신규, 93체크): 충돌 6종 전수 재확인,
  등재 누락 시 raise하는 가드 자체 검증(표에서 하나 삭제 후 원상복구), 8개 그룹의
  canonical/duplicate/ambiguous role·status·statusReasons·memberIds 정확성, entry 36의
  4-way 오판정 방지, 짝 없는 단독 참조(0003-01)·무관 콤보(0001-01)의 identityCollision
  없음, entry 12/14 cross-entry case 3 검증(§E), 합성 데이터로 future promotion block이
  실제로 재평가되는지(§F: 하나만 otherwise-verified / 둘 다 otherwise-verified / script
  동일한 대조군이 여전히 case 2로 처리됨), 재산출 집계 4종.
- `tests/combo-engine-extension-p2a5-test.py`: P2-A.5 시점에 놓친 이 collision을
  반영해 gained_ids/신규 assertion으로 정정(0013-02/0035-02가 이제 runtime-blocked임을
  명시).
- `tests/combo-engine-p2b1-smoke.js`: 기존 테스트 O(0009-01/02 이중 적용 기대)를
  폐기하고 O-1(collision duplicate는 0회 적용, canonical만 적용)·O-2(collision이 아닌
  진짜 독립 콤보는 여전히 중첩 — 일반 dedup으로 새지 않았음을 실데이터로 증명)로 교체.
  H(ammo) 테스트에 `isAmmo:true`를 실제로 표시해 하드 블록 분기를 태우도록 보강.
  matcher 단위 테스트에 isAmmo 하드 블록 전용 검증 추가.
- 기존 전체 스위트(24개 파일) + 신규 2개 파일 = 26개 파일 전량 PASS. 빌드 WARN 카운트
  (469/64/53/1) 불변.

## 7. 이번 단계에서 하지 않은 것

- P2-B(matcher 자체의 재검토·수정)는 보류 상태 그대로다 — 이번 변경은 matcher가
  소비하는 데이터(db-combos.json)의 정합성만 고쳤다(matcher 코드는 isAmmo 하드 블록 +
  sourceId 필드 추가만).
- G_Strings/G_Strings_('Pantie'/'삼각팬티')가 서로 다른 textragKey로 남아 있는 것이
  정확한 identity 판단인지는 이번 감사 범위 밖이다(이번 감사는 "동일 textragKey에 복수
  AegisName" 충돌만 다룬다 — 그 반대 방향은 P2-A.1의 별도 재검토 대상).
- entry 12/14(서바이버로드 case 3)의 동적 표현식(`getequiprefinerycnt`/`min`/`if-else`)
  자체를 canonical 변환하는 작업은 이번 범위 밖이다 — 그 작업이 이뤄져 둘 중 하나가
  "원래대로라면 verified"가 되는 순간, §3.4의 future promotion block이 자동으로
  작동해 canonical 승격 대신 전부 runtime-blocked로 처리한다.
