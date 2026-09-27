# 아이템/카드 효과 데이터 전수 감사 (P0-A + 교정 패스)

- 1차 커밋: `8ea0121`. 이 문서는 그 직후 발견된 **소비 경로 오판과 원작 미검증 활성화**를
  바로잡은 교정 패스 결과다. 1차 판정 중 잘못된 부분은 아래 §0에 명시하고, 실제로 유지되는
  수정은 §2, 되돌린 수정은 §3에 각각 정리한다.
- 범위는 여전히 P0-A(전수 감사 + 정본화 기반)다. 효과 집계기·전투식 대규모 개편(P0-B)은
  이번에도 착수하지 않았다.

## 요약 (교정 후 최종 수치)

| 항목 | 수량 |
|---|---|
| 전체 아이템 / 카드 수 | 2,796 / 531 (변경 없음) |
| 1차 패스가 활성화했던 항목(재검증 대상) | 73 (stat 38 + raceBonus 33 + 형제필드 2) |
| → 원작 근거 확인, 유지 | 0 |
| → **원작 근거 없음, 되돌림(D)** | **73 (전량)** |
| 실제로 유지되는 수정(소비 경로까지 확인됨) | 8 (중복 제거 7 + 평탄화 1) |
| desc-only(원작검증필요, 미변경) | 350 |
| raw rAthena script(원작검증필요, 미변경) | 44 |
| 엔진미지원 확정(baseline, 미변경) | 2 |
| 엔진미지원 신규 발견(고렘 weaponUnbreakable) | 1 |
| build.py 감사 | FAIL 0 / WARN 469 |

## 0. 1차 감사(8ea0121)의 잘못된 판정 — 소비 경로 재추적 결과

1차 문서는 "calcStats 카드 보너스 블록만 실제 소비처이며, `processTurn`은
`bonus.cardRaceBonus`/`cardSeProc`/`cardLifesteal`을 읽는다"고 적었다. **이것은 틀렸다.**
`source/template.html`을 다시 전수 추적한 결과:

- `calcStats()`(3953~4488행)는 카드 루프에서 `eff.type==='raceBonus'|'seProc'|'lifesteal'`을
  검사해 `bonus.cardRaceBonus`/`bonus.cardSeProc`/`bonus.cardLifesteal`을 만든다(4071~4083행).
  **그런데 이 세 값은 calcStats()의 반환 객체 `s`에 전혀 포함되지 않는다**(4451~4463행 반환
  객체 실측 — `cardRaceAtk`~`cardDropBonus`까지 20개 필드는 있으나 `cardRaceBonus`/
  `cardSeProc`/`cardLifesteal`은 없음). 즉 **calcStats 자신의 raceBonus/seProc/lifesteal
  집계는 계산만 되고 버려지는 죽은 계산이다.** 어디서도 쓰이지 않는다.
- 실제로 게임에 반영되는 경로는 완전히 별도다. `processTurn()`(5925~6622행) 안, 평타 명중
  직후 두 블록이 **매 히트마다 장착 장비를 다시 `parseItem()`으로 재파싱하고 카드 DB
  (`DB.items[cardName+" 카드"]`)를 직접 다시 읽는다**:
  - 6270~6287행(레거시 경로): `c.hpDrain`/`c.spDrain`/`c.inflict`/`c.autoSpell`을 카드 객체
    최상위 필드에서 직접 읽어 흡혈/SP흡수/상태이상 부여/오토스펠을 실행한다. **DB에 이
    네 필드를 쓰는 아이템은 현재 0건**이라 코드는 살아 있지만 배선된 데이터가 없다.
  - 6307~6347행(v9.04 경로): `card.effect.type`을 직접 읽어 `raceBonus`(종족 추가 데미지),
    `seProc`(상태이상 확률), `lifesteal`(SP 흡수)을 그 자리에서 즉시 적용한다. **이것이
    raceBonus/seProc/lifesteal의 유일한 실제 소비처다.** calcStats의 동명 필드와는 무관하다.
- `weaponUnbreakable`도 같은 문제다: `calcStats()`가 `p.cardEffects.weaponUnbreakable=true`를
  설정하지만(4066~4068행), 전체 코드베이스에 이 필드를 **읽는** 코드가 없다(무기 파괴
  메커닉 자체가 구현되어 있지 않음 — "무기 파괴 방지" 데스크립션을 가진 스킬 2개도 실제로는
  `effect:null`이거나 로그만 찍는다). 고렘 카드의 "무기 절대 손상 불가"는 원작 근거는
  있으나(§2 카드DB 대조) 엔진 자체가 이 개념을 구현하지 않아 항상 무의미하다 — **엔진미지원**.

**교훈**: "calcStats에서 집계됨"과 "실제 게임에서 작동함"은 다른 말이다. 카드 루프 안에
있다고 해서, 혹은 반환 객체를 만든다고 해서 그 값이 실제로 소비된다는 보장이 없다. 반드시
반환 객체의 필드 목록과, 그 필드를 실제로 읽는 다른 코드 위치까지 추적해야 한다.

## 1. 71건 + 2건 재검증 결과 — 전량 되돌림 (판정 D)

1차 패스는 `effect.effect`(레거시 키)를 `effect.type`으로 **이름만 바꾸면 안전한 rename**
이라고 판단했다. 그러나 위 §0에서 확인했듯 `effect.type==='raceBonus'`는 `processTurn()`의
직접 재파싱 경로가 **실전투에서 즉시 소비**한다 — 이 rename은 "죽어 있던 데이터를 실제
전투 데미지로 활성화"하는 **행동 변경**이었지, 무해한 표기 정리가 아니었다.

검증 절차: 대상 71건(stat 38 + raceBonus 33) + 사이드 2건(피에르/현신(골렘형), 형제필드
문자열 effect)을 아래 두 소스와 전수 대조했다.

1. **이 프로젝트 자신의 카드 원작 조사 문서** — `text-rag-docs/데이터베이스/카드_무기 db.md`,
   `카드_액세서리 db.md`, `카드_갑옷db.md`, `카드_방패 db.md`, `카드_투구 db.md`,
   `카드_걸칠것 db.md`, `카드_신발 db.md` (inven.co.kr 원작 카드 데이터표, 총 약 400항목).
2. **이 프로젝트의 몬스터 DB** — `source/data/db-monsters.json`(490종) — raceBonus 카드가
   전제하는 "드롭 몬스터"가 실제로 존재하는지.

결과:

- **73건 전부 두 소스 어디에서도 근거를 찾지 못했다.**
  - raceBonus 33건이 가리키는 몬스터명(반어인·비행 쁘띠·쉘피쉬·바토리·텐구·인면도화·
    아이시클라·흑사·잎사귀 캣·우드 고블린·키키모라·고피니치·언그라이언트·마왕 모로크·
    브라디움 골렘·네펜데스·나가·텐드릴리온·스팀 고블린·알리게이터·우드 고렘·파이어락
    솔져·주포룡·피치 트리·데들리 레이스·폐수 난로·핀귀큘라·코볼트(도끼)·코볼트(모닝스타)·
    에이션트 미라, 현신 4종)는 **`db-monsters.json`에 단 하나도 존재하지 않는다**(정확한
    이름 매치 0건, 부분 문자열 매치도 0건). 카드는 있는데 드롭시킬 몬스터 자체가 게임에 없다.
  - stat 38건 중 이름이 우연히 겹치는 몇몇("스케골트", "흑사", "페러스", "코볼트" 등)을
    카드 원작 문서에서 찾아 대조했으나 **효과 자체가 전혀 다르다**. 예: 카드 원작 문서의
    "스케골트카드"는 "마법공격 시 악마형 적에게 2% 추가 마법 대미지"인데, DB의
    "스케골트(청)/(흑) 카드"는 `int+1/dex+1`·`str+1/dex+1` 단순 스탯 — 이름만 비슷할 뿐
    다른 효과다. "화이트스미스 하워드(일반) 카드"(DB: str+2/dex+2)도 원작 문서의
    "화이트스미스카드"(10% 무기파괴/7% 방어구파괴 확률)와 전혀 다르다. "이그니젬
    세니아(일반) 카드"(DB: int+2/dex+2)도 원작 문서의 "이그니젬세니아카드"(INT 18당
    STR+1 전환)와 다르다. `(일반)` 접미사가 붙은 7종(이그니젬 세니아·아르마이아 딘제·
    위케바인 트레스·어쌔신크로스 에레메스·스나이퍼 세실·하이프리스트 마가레타·화이트스미스
    하워드)은 원작 rAthena 카드의 실제(복잡한) 효과를 단순 스탯으로 대체한 **자체 제작
    placeholder**로 보인다.
  - 나머지 stat 카드(아르기오페·펜·앙겔링·스테이너·코르누투스·지어스·가름·룻더·타임홀더·
    체카·콘스탄트·가디언·설인·무스시펠라·히밤·레스·바바야가·우자스·마브카·앙그라 만티스·
    지키는 자·타나토스의 사념체·절망의 신 모로크·둥지 수호자·니드호그의 그림자·방황하는
    자·몹스터·모로크 인카네이션)도 카드 원작 문서 7종 어디에도 이름이 없다.
  - 모든 73건의 `desc`가 예외 없이 `"{카드이름} 카드"` 형태의 **자동 생성 placeholder**라는
    점(사람이 쓴 설명이 아님)도 이 항목들이 대량 스텁 생성 단계에서 "그럴듯한 종족/수치"를
    형식적으로 채워 넣은 placeholder라는 정황과 일치한다.
- 판정: **D. 원작 근거를 찾지 못함** — 전원.
- 조치: **전부 되돌림.** `git show 8ea0121~1:source/data/db-items.json`에서 원본 그대로
  복원하고, `effect` 객체(또는 사이드 2건은 아이템 최상위)에 `"_pendingVerification": true`를
  추가해 "원작 근거를 찾지 못해 의도적으로 비활성 상태로 되돌렸다"는 사실을 데이터 자체에
  남겼다. `현신(인간형) 카드`의 `인간→인간형` 자모 수정도 "카드 이름 기반 추론"이었을 뿐
  rAthena 근거가 없어 함께 되돌렸다(`race:"인간"`으로 복원) — §4 참조.

## 2. 실제로 유지되는 수정 (8건) — 소비 경로까지 확인된 안전한 수정

| 아이템 | 효과 | DB 표현 | calcStats 집계 | calcStats 반환 | 직접 재파싱 소비 | 실제 실행 여부 | 원작 근거 | 판정 |
|---|---|---|---|---|---|---|---|---|
| 드롭스 카드 | DEX+1/HIT+3 | 최상위 `dex,hit`만(중복 effect 제거) | `bonus.dex/hit` | `s.dex/s.hit` | 없음(불필요) | 실행됨 | 카드DB `카드_무기 db.md` "DEX+1 명중율+3" 완전 일치 | 정상 |
| 파브르 카드 | VIT+1/MaxHP+100 | 최상위만 | `bonus.vit/maxHp` | `s.vit/s.maxHp` | 없음 | 실행됨 | 카드DB `카드_무기 db.md` "VIT+1 HP최대치 100 증가" 완전 일치 | 정상 |
| 프리오니 카드 | HIT+100 | 최상위만 | `bonus.hit` | `s.hit` | 없음 | 실행됨 | 카드DB `카드_무기 db.md` "명중률+100" 완전 일치 | 정상 |
| 호넷 카드 | STR+1/ATK+3 | 최상위만 | `bonus.str`, `wAtk` | `s.str/s.weaponAtk` | 없음 | 실행됨 | 카드DB `카드_무기 db.md` "STR+1 ATK+3" 완전 일치 | 정상 |
| 루나틱 카드 | LUK+1/CRIT+1/완전회피+1 | 최상위만(`bonus.pd`↔`perfectFlee` 별칭 중복도 제거) | `bonus.luk/crit/pd` | `s.luk/s.crit/s.pd` | 없음 | 실행됨 | 카드DB `카드_무기 db.md` "LUK+1 크리티컬율+1 완전회피+1" 일치 | 정상 |
| 고렘 카드 | 무기파괴불가/ATK+5 | 최상위 `atk`+`effect:{type:'special',weaponUnbreakable}`(중복 `bonus.atk`만 제거) | `bonus`(atk 최상위 경로), `p.cardEffects.weaponUnbreakable` | `s.weaponAtk` | `weaponUnbreakable`는 소비처 없음(엔진 자체 미구현) | ATK 부분만 실행됨 / weaponUnbreakable은 **엔진미지원** | 카드DB "무기는 절대로 손상되지 않는다. 공격력+5" 일치 | ATK 정상, weaponUnbreakable 엔진미지원 |
| 스켈레톤 카드 | ATK+10/2% 스턴 | 최상위 `atk`+`effect:{type:'mixed',seProc}`(중복 `bonus.atk`만 제거) | `bonus`(atk), `bonus.cardSeProc`(죽은 계산) | `s.weaponAtk` | processTurn 직접 재파싱이 `seProc` 소비 | ATK/seProc 둘 다 실행됨(seProc은 원래부터 `type:'mixed'`였음 — 이번에 새로 활성화한 게 아님) | 미검증(카드DB에 이름 없음) — 이미 `type` 정본 상태였고 이번 패스가 건드린 건 중복 `bonus.atk` 뿐 | ATK 정상, seProc은 기존 상태 유지(별건) |
| 은총받은 자 카드 | HIT+15 | `effect:{effect:'derived',bonus:{hit:15}}` → 최상위 `hit:15`로 평탄화 | (구) `eff.bonus`는 **type 무관 무조건 합산**이라 원래도 적용됨 | `s.hit` | 없음 | 실행됨(승격 전후 동일 동작 — 행동 변경 아님) | 단순 평탄화라 원작 검증 불필요(수치 자체는 안 바뀜) | 정상 |

**스켈레톤 카드에 대한 정정**: 1차 문서는 이 카드를 "중복 제거 7건"에 묶었는데 맞다 — 이
카드는 `effect.effect`가 아니라 **이미 `effect.type:'mixed'`** 상태였다(71건 rename
대상이 아니었음). 이번 패스가 건드린 것은 중복된 `bonus.atk`뿐이고, `seProc`(2% 스턴)은
1차 패스 이전부터 이미 살아있던 정상 소비 상태였다 — 되돌림 대상이 아니다.

## 3. 되돌린 수정 (73건)

§1 판정에 따라 다음이 `git show 8ea0121~1`의 원래 값 그대로, `_pendingVerification:true`
표식과 함께 복원됐다.

| 그룹 | 건수 | 되돌린 형태 | 판정 | 조치 |
|---|---|---|---|---|
| stat (effect.effect → 되돌림) | 38 | `effect:{effect:'stat',stats:{...}, _pendingVerification:true}` | 원작검증필요 | 원작 확인 후 재검토 |
| raceBonus (effect.effect → 되돌림) | 33 | `effect:{effect:'raceBonus',race,dmgMult, _pendingVerification:true}` | 원작검증필요 | 원작 확인 후 재검토 |
| 피에르 카드 (형제필드 → 되돌림) | 1 | `effect:'stat', stats:{def:1}, _pendingVerification:true`(형제필드 원형) | 원작검증필요 | 원작 확인 후 재검토 |
| 현신(골렘형) 카드 (형제필드 → 되돌림) | 1 | `effect:'raceBonus', race:'골렘', dmgMult:1.2, _pendingVerification:true` | 원작검증필요 | 원작 확인 후 재검토 |

`_pendingVerification`은 `build.py`의 `audit_item_effects()`가 인식한다 — 이 표식이 있으면
`legacy-effect-key`/`reserved-string-effect`가 FAIL이 아니라 WARN으로만 잡힌다. 표식이
없는 **새** 항목이 같은 레거시 패턴을 쓰면 여전히 FAIL이다(회귀 방지, §5·`tests/`).

## 4. 현신(인간형) 카드 재검증

1차 패스는 "카드 이름이 인간형이니 내부 `race`도 인간형이어야 한다"는 **이름 기반 추론**으로
`race:"인간"`→`"인간형"`을 고쳤다. 이번 재검증에서 rAthena Pre-Renewal 근거를 찾으려 했으나
카드 원작 문서 7종·몬스터 DB 어디에도 "현신(인간형) 카드" 자체가 없어 확인 불가 —
이름 기반 추론은 근거가 아니므로 **되돌렸다**(`race:"인간"`으로 복원, `_pendingVerification`
표식 추가). 이 카드 자체가 §1의 raceBonus 33건 중 하나로 전부 되돌려졌으므로 실질적으로는
비활성 상태라 게임에 영향은 없다 — 다만 "이름이 같아 보이니 맞다"는 추론 자체를 정본
근거로 쓰지 않는다는 원칙을 문서에 남긴다.

## 5. build.py 감사 — 교정 사항

- `_pendingVerification` 인식 로직 추가(위 §3). `legacy-effect-key`/`reserved-string-effect`는
  이 표식이 있으면 WARN, 없으면 여전히 FAIL — 새 레거시 패턴 유입은 계속 차단된다.
- `KNOWN_RACE_VALUES` 등 나머지 감사 로직은 1차 패스와 동일(변경 없음).
- 현재 결과: **FAIL 0건 / WARN 469건**(1차 396건 + 이번에 되돌린 73건이 WARN으로 새로 잡힘).

## 6. 원작검증필요/엔진미지원 총계 (변경 없음 — 394건은 여전히 대기)

desc-only 350건(카드 257 + 장비 93) + raw rAthena script 44건(무기) = 394건은 1차 패스와
동일하게 손대지 않았다. 이번 패스의 대상은 **이미 행동을 바꿔버린 71+2건**이었지, 새 범위를
연 것이 아니다. 이 394건을 전부 원작 대조해야 P0-B를 시작할 수 있다는 뜻은 아니다 — §7 참조.

## 7. 테스트 (신규)

`tests/item-effect-canon-correction-smoke.js` — `source/template.html`에서 `calcStats()`·
`parseItem()`·카드 effect-on-hit 블록(6307~6347행)을 **그대로 추출**해 Node에서 실행한다.

1. 드롭스 카드 DEX+1(→HIT+1 간접 기여)/HIT+3(직접) — 정확히 1회, 해제 시 원복.
2. 프리오니 카드 HIT+100 단독 — 교차항 없는 순수 중복 검증(중복이면 +200이 됐을 것).
3. 파브르 카드 VIT+1/MaxHP+100 — "VIT단독 + MaxHP단독"의 합과 합성 카드 결과가 정확히
   같음을 확인(가산성 검증, 공식 계수를 하드코딩하지 않음).
4. 고렘 카드 ATK+5 — `s.weaponAtk` 델타로 정확히 +5(구버전은 +10 — 중복).
5. 아르기오페 카드(되돌려진 원작검증필요 항목) — 장착해도 INT 변화 없음(비활성 유지 확인).
6. 반어인 카드(되돌려진 원작검증필요 항목) — 어류 대상 공격에도 추가 데미지 없음(비활성
   확인, 실제 processTurn 소비 코드 블록으로 검증).
7. 같은 소비 코드 블록에 `effect.type:'raceBonus'`를 임시로 설정한 가상 시나리오로,
   raceBonus가 실제로 활성화됐을 때 **일치하는 종족에만** 적용되고 **다른 종족에는 적용되지
   않음**을 확인(소비 코드 자체의 선택성 검증 — 현재 활성 데이터가 없으므로 어떤 항목을
   활성화할지와는 별개로 메커니즘 정확성만 확인).

검증:

```
python -m py_compile build.py
python build.py                                    # OK, item effect audit: 469 issue(s) (전부 WARN, FAIL 0)
node tests/actor-interaction-smoke.js               # OK
node tests/alberta-doll-exchange-smoke.js           # OK
node tests/refine-reveal-smoke.js                   # OK
node tests/item-effect-canon-correction-smoke.js    # ALL TESTS PASS (신규)
python tests/item-effect-audit-test.py              # ALL TESTS PASS
```

## 8. P0-B 착수 가능 여부

**차단 사유 없음.** 판단 기준은 "394건을 전부 원작 대조했는가"가 아니라 **"지금 활성화돼
있는/활성화하려는 효과 데이터가 안전한가"**다. 이번 교정으로:

- 1차 패스가 원작 검증 없이 활성화했던 73건은 전부 비활성 상태로 되돌아갔고, 표식이 남아
  회귀 감사가 자동으로 잡는다.
- 실제로 게임에 반영되는 8건(§2)은 프로젝트 자체 카드 원작 문서로 값이 확인됐거나(6건),
  단순 평탄화라 원작 검증이 불필요하거나(1건: 은총받은 자), 이미 이전부터 정상 동작 중이던
  부분을 건드리지 않은 것(1건: 스켈레톤의 seProc)이다.
- 394건(원작검증필요)은 **그대로 원작검증필요로 남겨도 안전** — 구조화되지 않은 desc-only
  상태라 애초에 아무 코드도 이 값을 읽지 않는다. P0-B가 `effects[]` 집계기를 만드는 것과
  이 394건을 원작 대조해 채우는 것은 **병행 가능한 별개 작업**이다. 다만 P0-B가 새 데이터를
  `effects[]`에 채울 때는 이번 교정에서 확인한 원칙(desc/이름 추론 금지, 실제 소비 코드
  경로까지 확인, 프로젝트 카드DB·몬스터DB 등 실제 소스와 대조)을 그대로 적용해야 한다.
