# COMBO_IDENTITY_COLLISION_AUDIT.md — P2-A.6 identity collision 감사

P2-B(콤보 matcher/runtime 연결)는 이 작업 동안 보류한다. combo-engine.js는 P2-B1에서
이미 구현·연결됐지만, 그 matcher가 소비하는 `db-combos.json`의 identity 정합성 자체에
구멍이 있었다는 것이 이번 감사로 드러나 먼저 정정한다.

## 1. 문제

`combo-item-identity.json`(P2-A.1)은 각 rAthena AegisName을 독립적으로 TextRAG
textragKey 1개에 매핑한다(1:1 exact match, fuzzy 금지). 그런데 rAthena 자체에 "이름·
스탯이 완전히 같고 슬롯 유무만 다른" 레거시 아이템 쌍이 존재해서, 서로 다른 AegisName
두 개가 TextRAG에서는 같은 표시명 하나로 합쳐지는 경우가 있다. 이 경우 콤보 variant
2개가 "TextRAG identity 기준"으로는 완전히 같은 요구 아이템 집합이 되어, 실제 게임에서는
있을 수 없는 "같은 슬롯의 두 alias를 동시에 장착"한 것처럼 콤보 matcher가 착각할 수
있다. P2-B1은 이 경우를 "rAthena variant 독립 중첩" 원칙(정당한 원칙 자체는 맞다 —
§3.1 참조)으로 잘못 처리해 원작에 없는 이중 적용을 만들었다.

## 2. 조사 방법

1. `combo-item-identity.json`의 verified 항목(aegisName→textragKey) 278개를 역매핑해
   하나의 textragKey에 복수 aegisName이 매핑된 경우를 전수 조사(추측/표본 아님).
2. 발견된 각 충돌 쌍에 대해 rAthena `db/pre-re/item_db_equip.yml`(pin
   `e985006171d2eb320ee512a653f4c83aea3d81b6`) 실코드를 직접 대조 — Type/Locations/
   Jobs/Defense·Attack/Script/Slots를 항목별로 비교.
3. `db-combos.json`의 156개 variant 전체에서, 이 충돌 aegis 쌍이 실제로 같은 source
   entry 안 두 variant를 "TextRAG identity 기준 완전 동일"로 만드는지 확인.

## 3. 결과

### 3.1 rAthena variant 독립 중첩 원칙 자체는 유효(재확인)

`ComboDatabase::parseBodyNode`(itemdb.cpp)는 하나의 `Combos:` 블록 안 각 `Combo:`
variant를 완전히 독립된 `s_item_combo` 레코드로 등록하고, `pc_checkcombo`/
`status_calc_pc`는 variant마다 독립적으로 매칭·`run_script`한다(동일 id 재등록만 막고
다른 id 간 dedup 없음) — 이 자체는 P2-B1이 이미 정확히 확인한 사실이며 바뀌지 않는다.
문제는 이 원칙이 아니라, TextRAG의 identity collapse가 원작에서는 불가능한 상황을
"동시 만족"으로 잘못 재현한 것이다.

### 3.2 발견된 충돌: 6개 textragKey, 전부 evidence 기반 evidence-1(exclusive-alias)

| textragKey | AegisName 쌍 | 근거 |
|---|---|---|
| 매직코트 | Mage_Coat / Mage_Coat_ | 둘 다 Type=Armor, Locations.Armor=true, Jobs·Defense·Script(bMdef+5,bInt+1) 완전 동일, 차이는 Slots(무/유 1) |
| 닌자슈츠 | Ninja_Suit / Ninja_Suit_ | Armor, Locations.Armor, Jobs·Defense·Script(bAgi+1,bMdef+3) 동일, Slots만 차이 |
| 아머 | Padded_Armor / Padded_Armor_ | Armor, Locations.Armor, Jobs(9종)·Defense 동일, Slots만 차이 |
| 서바이버로드 | Survival_Rod_ / Survival_Rod2_ | Weapon/Staff, Locations.Right_Hand, Jobs·Attack·Range·WeaponLevel 완전 동일(Slots도 동일 — 완전 중복 DB 레코드) |
| 런닝셔츠 | Undershirt / Undershirt_ | Armor, Locations.Garment, Defense·Script(bMdef+1) 동일, Slots만 차이 |
| 롱혼 | Long_Horn / Long_Horn_M | Weapon/1hSpear, Locations.Right_Hand, Jobs·Attack·Range·WeaponLevel 동일, `_M`만 Trade 제한(결혼 지급용 추정) |

**전부 "같은 equip location(같은 슬롯)의 exclusive alias" — 판정 1(원작에서 실제
동시 장착 가능)이나 판정 3(구분할 정보 없음)에 해당하는 사례는 이번 감사에서 0건.**
같은 슬롯 1개뿐이라 원작에서 두 alias를 동시에 장착하는 것 자체가 물리적으로
불가능하다는 것이 판정 근거이며, 추측이 아니라 rAthena YAML의 `Locations` 필드로
직접 확인했다.

### 3.3 실제 콤보에 나타난 충돌: 7개 그룹(source entry 6개 → variant pair 7개)

| source entry | variant | 상태(정정 전→후) | 비고 |
|---|---|---|---|
| 9 | 0009-01(Mage_Coat) / 0009-02(Mage_Coat_) | verified/verified → verified/**runtime-blocked** | |
| 13 | 0013-01(Survival_Rod_) / 0013-02(Survival_Rod2_) | verified/verified → verified/**runtime-blocked** | |
| 34 | 0034-01(Padded_Armor) / 0034-02(Padded_Armor_) | verified/verified → verified/**runtime-blocked** | |
| 35 | 0035-01(Ninja_Suit) / 0035-02(Ninja_Suit_) | verified/verified → verified/**runtime-blocked** | |
| 36 | 0036-01/02(Undershirt 계열) | verified×2 → verified/**runtime-blocked** | G_Strings 쪽 고정 |
| 36 | 0036-03/04(Undershirt 계열) | verified×2 → verified/**runtime-blocked** | G_Strings_ 쪽 고정, 01/02와는 **별개 그룹**(4-way 아님) |
| 2 | 0002-01(Long_Horn) / 0002-02(Long_Horn_M) | unsupported/unsupported(불변) | 다른 사유로 이미 unsupported — runtime 영향 없음, 문서화만 |

entry 36은 `G_Strings`(→'Pantie')와 `G_Strings_`(→'삼각팬티')가 서로 다른
textragKey로 남아 있어(이 둘은 이번 충돌 감사 대상이 아님 — 별개 identity 판단이라
이번 범위 밖) 4개 variant가 하나로 뭉쳐지지 않고 **독립된 두 pair**로 정확히 분리된다.
"source entry 단위 일반 dedup" 금지 원칙이 여기서 실제로 검증된다.

entry 3(0003-01, Long_Horn 단독 참조)은 짝이 되는 variant가 없어 충돌이 실제로
나타나지 않으므로 identityCollision 주석이 붙지 않는다.

## 4. 판정과 구현

**전부 판정 2(원작에서는 배타적 alias/슬롯 차이, TextRAG가 하나로 합침 → 1회만 적용)**.
판정 1·3 사례는 없었다.

구현은 `tools/canonicalize_combos.py`에 추가했다(runtime matcher가 아니라 데이터
생성 단계에서 해소 — matcher 쪽에 "textragKey가 같으면 dedup" 같은 일반 규칙을 추가하지
않았다):

- `IDENTITY_COLLISION_JUDGMENTS`: 위 6개 쌍 + 근거를 하드코딩한 표(추측 금지 — 새 충돌이
  나타나면 `audit_identity_collision_coverage()`가 즉시 raise, 개별 조사 후 등재해야만
  통과).
- `compute_identity_collisions()`: identity map 역매핑 전수 조사.
- `detect_identity_collisions()`: 같은 source entry 안에서만 비교(entry 단위 일반
  dedup이 아니다). requiredItems가 textragKey 기준 완전히 같아진 variant 그룹 중,
  그 동일성이 IDENTITY_COLLISION_JUDGMENTS에 등재된 aegis 쌍 때문일 때만 인정한다.
  가장 낮은 variant_idx를 canonical로 삼아 verified 유지, 나머지는 verified였을 때만
  `runtime-blocked`로 낮춘다(승격 목적 조작이 아니라 원작에 없는 이중 적용을 막는
  되돌림). 모든 관련 variant에 `identityCollision`(role/canonicalId/memberIds/
  collisionTextragKeys) 메타데이터를 남긴다.

`source/combo-engine.js`(matcher)에는 이 collision 해소를 위한 별도 로직을 추가하지
않았다 — 기존 `status !== 'verified'` 필터가 duplicate를 자동으로 걸러낸다. 대신
요청받은 다른 두 가지 방어를 추가했다:

- `matchCombos`에 `requiredItems.isAmmo === true` 하드 블록 추가(activeAmmo 정본 전까지
  무조건 false — `getActiveLoadout`이 애초에 ammo를 수집 안 하는 구조적 방어와는 별개인
  명시적 두 번째 방어선).
- ledger 항목에 `source`(기존)와 별개로 `sourceId`(combo.id, 안정 식별자) 필드 추가.

## 5. 재산출된 집계 (156 variant 전체 불변)

| status | 정정 전 | 정정 후 |
|---|---|---|
| verified | 47 | **41**(-6) |
| runtime-blocked | 0 | **6**(+6, identity collision duplicate 전량; ammo 유래는 현재 0건) |
| unsupported | 51 | 51(불변) |
| source-needed | 58 | 58(불변) |

`combo-effect-support-backlog.json`/`combo-effect-support-matrix.json`/
`combo-engine-extension-backlog.json`은 재생성해 diff한 결과 **바이트 단위로 무변화**
(전부 `effects`/`unsupportedEffects` 기준으로만 집계하고 이번에 바뀐 `status`/
`identityCollision` 필드는 참조하지 않는다).

## 6. 테스트

- `tests/combo-identity-collision-audit-test.py`(신규, 68체크): 충돌 6종 전수 재확인,
  등재 누락 시 raise하는 가드 자체 검증(표에서 하나 삭제 후 원상복구), 7개 그룹의
  canonical/duplicate role·status·statusReasons·memberIds 정확성, entry 36의 4-way
  오판정 방지, 짝 없는 단독 참조(0003-01)·무관 콤보(0001-01)의 identityCollision 없음,
  재산출 집계 4종.
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
