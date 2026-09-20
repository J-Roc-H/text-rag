# DEVREF-C — 카드 · 아이템 파싱 규칙

> 로드 조건: **카드 합성·아이템 표시·인벤토리 UI** 작업 시

-----

## parseItem 정규식 (반드시 lazy 버전 사용)

```javascript
// ❌ 틀린 버전 (greedy — cards 파싱 실패)
name.match(/^([^\[\<]+)(?:\s\[(\d+)\])?(?:\s\<([^\>]+)\>)?/);

// ✅ 올바른 버전 (lazy + $ 앵커)
name.match(/^([^\[\<]+?)(?:\s\[(\d+)\])?(?:\s\<([^\>]+)\>)?$/);
// "발키리의투구 [1] <가이아스>" → m[1]="발키리의투구", m[2]="1", m[3]="가이아스"
```

## parseItem 결과 구조

```
"소드 [4] <포링, 루나틱>"
  baseName: "소드"
  slots: 4   ← [N] 표기 우선; 없으면 DB.items[baseName].slots 폴백
  cards: ["포링", "루나틱"]
```

**slots 우선순위**: `[N]` 표기 > `DB.items[baseName].slots` > 0

-----

## HTML 내 아이템 키 이스케이프 규칙

합성 아이템 키에 `<` `>` 포함 → onclick/option value에 직접 삽입 시 HTML 파서가 태그로 해석 → DOM 파괴.

```javascript
// 반드시 이스케이프 후 삽입
let safeK = k.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// onclick="showItemDetail('${safeK}')"
// <option value="${safeK.replace(/"/g,'&quot;')}">
```

HTML 속성에서 `&lt;`는 JS 실행 시 `<`로 자동 디코딩 → 함수에 올바른 키 전달됨.

**적용 위치**: renderInvPanel, showInvModal, showCardCompoundModal, openEquipModal

-----

## compound 아이템 DB 조회 패턴

```javascript
// ❌ 금지: compound 키는 DB에 없어서 undefined
let it = DB.items[n]; if(!it) return;

// ✅ 올바른 패턴 (모든 아이템 관련 함수에 적용)
let parsed = parseItem(n);
let it = (parsed && parsed.base) || DB.items[n];
if(!it) return;
```

적용 함수: showItemDetail, showInvModal, renderInvPanel, openEquipModal, calcStats, equipItem, unequipItem

-----

## renderInvPanel / showInvModal — displayItems 패턴

`p.inventory`만 순회하면 장착 중인 아이템 누락. `p.equip` 슬롯도 합산 필수.

```javascript
let displayItems = {};
Object.keys(p.inventory).forEach(k => {
  if((p.inventory[k]||0) > 0) displayItems[k] = { count: p.inventory[k], equipped: false, equippedSlot: null };
});
Object.keys(p.equip||{}).forEach(sl => {
  let eqName = p.equip[sl]; if(!eqName) return;
  if(!displayItems[eqName]) displayItems[eqName] = { count: 0, equipped: true, equippedSlot: sl };
  else { displayItems[eqName].equipped = true; displayItems[eqName].equippedSlot = sl; }
});
// 순회 시: isEq = data.equipped, slotType = data.equippedSlot || i.type
```

-----

## 아이템 표시명 규칙

- **표시명**: `getItemDisplayName(parseItem(key))` 사용 (raw 키 innerHTML 직접 삽입 금지)
- 카드 DB 키: `"포링 카드"` / 합성 시 장비명: `"소드 [4] <포링>"` (` 카드` 제거)
- prefix/suffix는 카드마다 하나만 (상호 배타)

-----

## showCardCompoundModal — 설계 원칙

카드 클릭 → 카드 고정, 장비 필터링.

```javascript
// 카드 target 타입에 맞는 장비만 필터링
if (cardTarget) {
  socketItems = socketItems.filter(k => {
    let pr = parseItem(k); let it = pr && pr.base;
    if (!it) return true;
    return it.type === cardTarget;
  });
}
```

- 카드 정보는 고정 블록 (드롭다운 없음), 장비 드롭다운만 있음
- `장착하기` 버튼에서 `preSelectedCard` 직접 사용
- option value에도 `safeVal` (이스케이프) 적용

-----

## openModal + showCardCompoundModal 호출 패턴

`showItemDetail`의 "🃏 합성" 버튼은 반드시 `close: false` 지정.  
기본적으로 `action()` 후 `closeModal()` 호출 → `showCardCompoundModal`이 즉시 닫힘.

```javascript
{ label:'🃏 합성', cls:'ok', close:false, action:()=>{ showCardCompoundModal(n); } }
```

-----

## updateUI — 장비 슬롯 표시명

`p.equip[sl]`은 raw compound 키 저장. 반드시 변환 후 삽입.

```javascript
// ❌ raw 키 직접 삽입 (HTML injection + prefix 미표시)
el.innerHTML = it + ...;

// ✅ 올바른 패턴
let parsedEq = parseItem(it);
let displayIt = parsedEq ? getItemDisplayName(parsedEq) : it;
el.innerHTML = displayIt + ...;
```

-----

## 카드 DB 현황 (2026-06-09)

- **구현 완료**: 175개 (7슬롯 전수 검증 완료)
- **미구현** (`desc:"(미구현)"`): 76개 (원작 RO 카드 + 커스텀 보스 카드)
- **HTML 내부 중복 키** (정리 필요): 10쌍
  - 방패 슬롯 8쌍 (엑서큐서너/오우거투스/타나토스의절망/따따초/호드렘린/플레임스컬/아크라우스/곰인형)
  - 액세서리 1쌍 (스템워름/스템웜)
  - 걸칠것 1쌍 (떠돌이늑대/방랑하는 늑대)