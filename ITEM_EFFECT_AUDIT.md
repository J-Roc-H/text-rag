# 아이템/카드 효과 데이터 전수 감사 (P0-A)

- 범위: `source/data/db-items.json` 전체 2,796건. 아이템·카드 효과가 **원작 근거 → DB 표현 →
  calcStats/집계 → 실제 소비처 → UI** 중 어디까지 연결됐는지 전수 분류하고, 의미가 완전히 동일한
  중복/레거시 표기만 정본 구조로 정리했다. 전투식 대규모 개편(P0-B)은 이번 범위 밖.
- 기준 커밋: 이 패치 직전 `main`. 검증 코드: `source/template.html`의 `calcStats()` 카드 보너스
  블록(장비 루프 내부, "카드 보너스 합산" 주석 아래)만이 실제 소비처다 — `processTurn()`은
  `calcStats()`가 만든 `bonus.cardRaceBonus`/`cardSeProc`/`cardLifesteal`을 그대로 읽어 쓰므로
  이 블록이 유일한 진입점이다.

## 요약 수량

| 항목 | 수량 |
|---|---|
| 전체 아이템 | 2,796 |
| 카드 수 | 531 |
| 레거시 effect 표기 발견 (수정 전) | 76 |
| → 정본 구조로 전환 완료 | 74 |
| → 엔진 미지원으로 baseline 등재(미수정) | 2 |
| 중복 수(최상위 수치 + 구조화 효과 동일값 중복) | 7 (전량 정리) |
| 종족 표기 통일(자모/축약 오표기, 자명한 경우만) | 1 (`인간`→`인간형`) |
| desc-only 효과 수(구조화 데이터 없음, 휴리스틱 탐지) | 350 (카드 257 + 장비 93) |
| raw script 수(desc에 rAthena 스크립트 원문 잔존) | 44 (전량 무기) |
| 원작검증필요 수(raw script + desc-only 합계) | 394 |
| 엔진미지원 확정 수(baseline 등재) | 2 |
| **실제 수정한 항목 수** | **81건**(레거시 전환 74 + 중복 정리 7, 일부 항목은 두 조치 중복 적용 없이 배타적으로 집계) |

> desc-only 350건은 **키워드 휴리스틱** 탐지 결과다(build.py `audit_item_effects`의
> `DESC_EFFECT_KEYWORDS`). 수동으로 표본을 재확인한 결과 일부는 이미 top-level 필드로
> 구조화돼 있는데 desc 문구(예: "저항의 껍질", "주문 시전을 돕는")가 우연히 키워드에
> 걸린 오탐이다(§4 참조). 전체 350건을 사람이 한 건씩 재확인하지는 않았다 — 이 문서가
> 하는 일은 "구조화 안 됨"을 실제 DB 전수조사로 찾아내는 것까지이며, 각 효과의 원작
> 수치 확정은 별도 판정으로 남긴다(요청 §3).

## 1. 발견된 표현 패턴 (수정 전 전수 집계)

| 패턴 | 수량 | 설명 |
|---|---|---|
| 최상위 stat 필드 (`str`~`maxSp`) | 각 20~1,149 (합산 아래 §1-1) | 단순 무조건 수치, 정본 |
| `effect`가 문자열 (`quiver`/`treasure`/`cure`/`teleport`/`town`/`aspd`/`full`/`half`/`deadbranch`/`cardalbum`/`antidote`) | 24 | 소모품 `useItem()` 액션 코드, 카드 스탯과 무관한 별도 네임스페이스. 정상. |
| `effect`가 문자열인데 카드 전용 예약어(`stat`/`raceBonus`)와 겹침 + 형제 필드로 값 존재 | 2 | 레거시. §2에서 처리 |
| `effect.type` (dict, 정본 소비 경로) | 9 | `calcStats()`가 실제로 분기하는 형태 |
| `effect.effect` (dict, **레거시** — 엔진은 `.type`만 읽음) | 74 | §2에서 처리 |
| `effect.stats` | 43 (전환 후 42) | |
| `effect.bonus` | 9 (전환 후 일부 정리) | |
| `effects[]` (신규 정본 배열) | 0 | 아직 아무 항목도 안 씀 — 엔진도 미소비(P0-B 대상) |
| `raceAtk`/`elemAtk`/`sizeAtk`/`raceDmgReduce`/`elemReduce`/`immune`/`spCostMul`/`healBoost`/`castReduction`/`skillDmg`/`grantSkill`/`dropBonus`/`magicRaceAtk`/`bossAtk`/`rangedDmgReduce`/`armorElement`/`magicImmune`/`doubleAtk`/`defIgnore`/`hpDrainSelf` | 0 | `calcStats()` 카드 루프에 소비 코드는 이미 있으나(엔지니어링 완료 상태), 이 필드를 쓰는 아이템이 현재 DB에 **0건**. 카드 전용 배선이라 장비(무기/방어구)에는 애초에 안 읽힌다. |
| `perfectFlee` | 7 | 정본, 소비됨 (`bonus.pd` alias) |
| raw rAthena script가 desc에 원문 잔존 | 44 | 전량 무기, §5 |
| desc-only(효과 설명 O, 구조 데이터 X) | 350 (휴리스틱) | §5 |

### 1-1. 최상위 stat/derived 필드 개수 (수정 전, 변화 없음 — 이미 정본)

str 143 · agi 141 · vit 101 · int 177 · dex 139 · luk 115 · atk 352 · def 1149 · matk 0 ·
mdef 226 · hit 25 · flee 59 · crit 44 · aspd 20 · maxHp 68 · maxSp 66

## 2. 실제 수정 내역 (81건)

### 2-1. `effect.effect` → `effect.type` 정본 전환 (71건, 자동 변환 가능)

`calcStats()`는 `c.effect.type`만 검사한다(`source/template.html` "카드 effect 필드 처리" 블록).
`effect.effect` 키를 쓰는 카드는 **DB에 값이 있어도 어떤 분기도 타지 않는 죽은 데이터**였다
(판정=**실행누락**). 값 자체는 이미 확정된 기존 데이터라 원작 재추측이 아니라 **키 이름만
`effect`→`type`으로 정규화**했다 — 수치·의미는 그대로.

| 유형 | 건수 | 예시 |
|---|---|---|
| `effect.effect:"stat"` → `type:"stat"` | 38 | 아르기오페 카드(INT+1), 펜 카드(DEX+1) 등 |
| `effect.effect:"raceBonus"` → `type:"raceBonus"` | 33 | 반어인 카드(어류+15%), 텐구 카드(조류+20%) 등 |

이 중 **현신(인간형) 카드**는 `race:"인간"`으로 저장돼 있었다 — 카드 이름은 "인간형"인데
내부 종족 키만 "인간"이라 다른 33건의 raceBonus 카드가 전부 쓰는 표기(`인간형`/`동물형`/`골렘`
등 "-형" 계열)와 불일치했다. 이름-내부값 자기불일치가 명백해 §3 원칙의 "인간→인간형 명백한
표기 통일" 예시 그대로 `인간형`으로 교정했다(다른 종족 표기 추측 변환은 하지 않음).

### 2-2. 단순 수치 최상위 승격, effect 객체 제거 (1건 + 2건)

- **은총받은 자 카드**: `effect:{"effect":"derived","bonus":{"hit":15}}` → 최상위 `hit:15`.
  원래도 `eff.bonus`가 `type` 값과 무관하게 무조건 합산되는 코드 경로 덕에 우연히 동작은
  하고 있었으나(판정=정상, 단 비표준), §2 원칙("단순 무조건 수치는 최상위 필드")에 맞춰
  정본화.
- **피에르 카드**: `effect:"stat", stats:{"def":1}` (중첩 아닌 형제 필드로 존재) → 최상위
  `def:1`. 기존 표기는 `effect`가 문자열이라 `eff.type`/`eff.stats` 어디에도 안 걸려 **실행누락**.
- **현신(골렘형) 카드**: `effect:"raceBonus", race:"골렘", dmgMult:1.2` (형제 필드) →
  `effect:{"type":"raceBonus","race":"골렘","dmgMult":1.2}`. 라이프스틸형과 달리 단일 수치로
  못 접기 때문에(카드 종족뎀 배율은 top-level 등가 필드가 없음) 정식 객체로 재구성.

### 2-3. 최상위-구조화 완전 중복 제거 (7건, 자동 변환 가능)

같은 수치가 최상위 필드와 `effect.stats`/`effect.bonus`에 **동시에** 있던 항목. `calcStats()`는
둘 다 읽으므로 수정 전에는 **이중 적용**됐다(판정=**중복**, 데미지/스탯이 desc 표기의 2배로
실제 게임에 적용되는 버그였다).

| 아이템 | 중복 수치 | 조치 |
|---|---|---|
| 드롭스 카드 | dex+1, hit+3 | effect 객체 전체 제거(잔여 내용 없음) |
| 파브르 카드 | vit+1, maxHp+100 | 전체 제거 |
| 프리오니 카드 | hit+100 | 전체 제거 |
| 호넷 카드 | str+1, atk+3 | 전체 제거 |
| 루나틱 카드 | luk+1, crit+1, **pd(perfectFlee)+1** | 전체 제거 — `bonus.pd`가 최상위 `perfectFlee`의 별칭임을 확인하고 포함 |
| 고렘 카드 | atk+5 | `bonus.atk`만 제거, `weaponUnbreakable:true`는 유지(중복 아님) |
| 스켈레톤 카드 | atk+10 | `bonus.atk`만 제거, `seProc`(스턴)은 유지(중복 아님) |

## 3. 손대지 않은 것 — 엔진 미지원 (baseline 등재 2건)

| 아이템 | 현재 표현 | 판정 | 이유 |
|---|---|---|---|
| 이미르의 잔해 카드 | `effect:{"effect":"special","type":"increaseDropRate"}` | 엔진미지원 | `calcStats()`/`processTurn()` 어디에도 `increaseDropRate`를 읽는 코드가 없음(grep 확인) |
| 상처받은 모로크 카드 | `effect:{"effect":"special","type":"increaseExpRate"}` | 엔진미지원 | 동일, `increaseExpRate` 소비 코드 없음 |

키 이름을 고쳐도 엔진이 이 타입값 자체를 모르므로 자동 변환 대상이 아니다. `build.py`의
`audit_item_effects()`는 이 둘을 `source/data/effect-audit-baseline.json`에 등재해 FAIL이
아닌 WARN으로만 보고한다. **조치 = 엔진 지원 후 편입(P0-B 이후).**

## 4. desc-only / raw script — 원작검증필요 (394건, 미수정)

지시사항(§3)에 따라 "한국어 desc만 보고 효과를 확정"하지 않았다. rAthena `db/pre-re` 원문과
직접 대조하지 않은 이상, 이 44+350건은 전부 **원작확인필요** 판정이며 임의 변환하지 않았다
(수정 금지 목록: "복잡한 rAthena script를 임의 해석해 게임 효과로 변환" 그대로 적용).

### 4-1. raw rAthena script 잔존 (44건, 전량 무기)

desc에 `bonus`/`bonus2`/`bonus3`/`autobonus`/`bAutoSpell` 원문이 그대로 남아 있다(예:
`아이시클피스트`: `bonus3 bAutoSpell,"SA_FROSTWEAPON",5,10;`, `드래곤킬러`:
`bonus bIgnoreDefRace,RC_Dragon; bonus2 bExpAddRace,RC_Dragon,10;`). 오토스펠/속성부여/종족
방어 무시 등 대부분 **엔진에 대응 시스템이 없는 조건부 효과**라 판정은
원작검증필요+엔진미지원 이중이다. 조치=**미지원 보류**(엔진 지원 후 편입).

### 4-2. desc-only 표본 재확인 (25건 수동 검증 → 16건 확정, 9건 오탐)

장비류(무기/투구/갑옷/방패/신발) 25건을 키워드 휴리스틱으로 뽑아 실제 JSON을 대조했다.

**확정 desc-only** (구조화 필드 전무, 효과 주장은 desc뿐) — 16건, 예:

| 아이템 | 효과(desc) | 현재 표현 | 실제 소비처 | 판정 | 조치 |
|---|---|---|---|---|---|
| 드래곤 슬레이어 | 용족 방어 무시 + 추가 피해 | atk만 | 없음 | 원작검증필요 | 원작 확인 후 변환 |
| 마그마 피스트 | 공격 시 화속성 부여 오토스펠 | atk만 | 없음 | 원작검증필요+엔진미지원 | 미지원 보류 |
| 본헬름 | 암속성 피해 15%↑ | def만 | 없음 | 원작검증필요 | 원작 확인 후 변환 |
| 슬리퍼의사자 | 전종족 피해 25%↓ | def만 | 없음(카드 전용 `dmgReduceAll`, 장비엔 미배선) | 원작검증필요+엔진미지원 | 엔진 지원 후 편입 |
| 리프레쉬슈즈 | MaxHP+17%/MaxSP+8%/HP자동회복 | def만 | 없음(카드 전용 `%`필드, 장비엔 미배선) | 원작검증필요+엔진미지원 | 엔진 지원 후 편입 |

(나머지 11건: 나간·불꽃의 기타·블러디 로어·마제스틱데빌혼·라이드워드모자·심연의투구·
리큐퍼레이티브아머·오를레앙의제복·스톤버클러·스트롱쉴드 — 동일 판정)

**오탐(false positive, 이미 정본 구조)** — 9건: 더크·슬레이어·란스·투 핸드 액스·발리스타·
쉴드·헤드램프(순수 flavor text, 효과 주장 없음), **캐스팅의로브**(desc "MDEF+4" = 이미
`mdef:4` 보유), **쉘터레지스턴스**(desc "전 스탯+1" = 이미 str/agi/vit/int/dex/luk 전부 보유).
휴리스틱 키워드("시전", "저항")가 flavor 문구에 우연히 걸린 경우다.

### 4-3. desc-only 전수 재집계 — 카드까지 포함 (350건)

최초 build.py 휴리스틱은 카드를 제외했었다(카드 대부분이 top-level 필드만으로 정본이라
가정). 하지만 재확인 결과 **카드 257건이 `effect` 필드도 최상위 특수 필드도 전혀 없이
desc에만 조건부 효과가 있다** — 예: `고블린 카드`("동물형 몬스터에게 20% 추가 대미지"),
`도플갱어 카드`("공격속도 대폭 상승"), `발키리 란드그리스 카드`("파괴불가/ATK+10%/물리 공격
시 오토스펠 디스펠 1레벨"). 종족/속성 피해, 스킬 데미지 증가, 오토스펠, 처치 시 효과, 상태이상
발동 등 요청 §2가 "향후 effects[] 정본으로 갈 예정"이라 명시한 조건부 계열과 정확히 일치한다.
**엔진을 대규모 구현하지 않는다는 지시(§2 말미)에 따라 이번 P0-A에서는 구조화하지 않고
그대로 남겨 원작검증필요/엔진미지원으로만 분류했다.** build.py의 `DESC_EFFECT_KEYWORDS`를
확장해 이 카드 257건도 매 빌드마다 WARN으로 잡히게 했다(§6).

## 5. 판정 요약표

| 판정 | 건수 | 조치 |
|---|---|---|
| 정상(정본 필드, 정상 소비) | 2,796 − (아래 합계) | — |
| 실행누락 → 수정 완료 | 76 | 자동 변환 가능(완료) |
| 중복 → 수정 완료 | 7 | 자동 변환 가능(완료) |
| 데이터불일치(종족 표기) → 수정 완료 | 1 | 자동 변환 가능(완료) |
| 엔진미지원(확정, baseline) | 2 | 엔진 지원 후 편입 |
| 원작검증필요 + 엔진미지원(raw script) | 44 | 미지원 보류 |
| 원작검증필요(desc-only, 카드+장비) | 350 | 원작 확인 후 변환 / 엔진 지원 후 편입 |

## 6. build.py 감사 (`audit_item_effects`)

FAIL(구조 위반, baseline 없이는 항상 실패):
- 최상위 예약어 충돌 문자열 effect(`stat`/`raceBonus`/... 가 문자열로만 존재)
- 레거시 `effect.effect` 키(≥ `type` 없이)
- 최상위-구조화 동일값 중복
- 금지된 종족 별칭(`인간` — `인간형`으로만 허용)
- raceBonus/seProc/lifesteal 필수 인수 누락

FAIL(baseline 등재 시에만 WARN으로 격하):
- 알 수 없는 `effect.type`(현재 `increaseDropRate`/`increaseExpRate` 2건만 baseline에 있음)
- 알 수 없는 종족 키(`KNOWN_RACE_VALUES` 미등록 값)

WARN(항상 통과, baseline 무관):
- desc에 rAthena 원시 스크립트 잔존
- desc-only(효과 설명 O, 구조화 데이터 X) — 휴리스틱
- `effects[]` 미소비 경고

`source/data/effect-audit-baseline.json`은 사람이 확인한 `(아이템, 코드)` 쌍만 담는다 —
자동으로 늘어나지 않는다. 새 FAIL이 뜨면 원작/엔진 지원 여부를 확인한 뒤에만 baseline에
추가할 것.

## 7. 검증

```
python -m py_compile build.py   # OK
python build.py                  # OK - item effect audit: 396 issue(s) (전부 WARN, FAIL 0)
node tests/actor-interaction-smoke.js         # OK
node tests/alberta-doll-exchange-smoke.js     # OK
node tests/refine-reveal-smoke.js             # OK
python tests/item-effect-audit-test.py        # ALL TESTS PASS (신규)
```

## 8. 다음 단계(P0-B) 관련

P0-B(효과 집계기·전투식 대규모 수정)는 이번 세션에서 착수하지 않았다. 시작 전 확인 필요:

- **카드 257건 + 장비 93건(desc-only) + 무기 44건(raw script) = 394건**의 원작 수치 대조가
  선행돼야 effects[] 정본 스키마를 값 손실 없이 채울 수 있다. 지금 당장 P0-B의 엔진(집계기)만
  먼저 만들면 데이터가 없어 빈 배열만 도는 스켈레톤이 된다.
- 카드 전용으로 이미 배선된 `raceAtk`/`dmgReduceAll`/`maxHpPct` 등 필드가 **장비(무기/방어구)
  에는 안 읽힌다** — P0-B가 장비 레벨 효과까지 다루려면 이 배선을 장비 루프에도 복제할지
  결정 필요(엔진 확장이므로 P0-A 범위 밖으로 보류함).
- 차단 사유 없음 — P0-A가 정본 스키마(최상위 vs `effect.type`)를 확정하고 회귀 게이트까지
  깔았으므로 P0-B 착수 가능. 단, 위 394건 원작 대조 없이 값을 채우면 §3 원칙 위반이 된다.
