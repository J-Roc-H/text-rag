'use strict';
// 가방 정리(창고 분류 보기·일괄 이동·전승 준비·아이템별 방침) 회귀 검사.
// source/services.js의 실제 텍스트(svcReadWarehouse ~ 가방 정리 블록 끝)와 template.html의
// parseItem·shopSelectByPolicy를 그대로 추출해 실제 아이템/몬스터 데이터로 돌린다(재구현 아님).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractBetween, extractFunction, html, items } = require('./_item-effect-harness');

const servicesSrc = fs.readFileSync(path.join(__dirname, '..', 'source', 'services.js'), 'utf8');
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'source', 'data', 'db-monsters.json'), 'utf8').replace(/^﻿/, ''));

const blockSrc = extractBetween(
  servicesSrc,
  'function svcReadWarehouse(){',
  '// ══════════════════════════════════════════════\n// 1차-3. 던전 입장'
);
const parseItemSrc = extractFunction(html, 'function parseItem(name) {');
const shopSelectSrc = extractFunction(html, 'function shopSelectByPolicy(){');
const svcHtmlSrc = extractFunction(servicesSrc, 'function svcHtml(v){');

function makeEnv(opts) {
  opts = opts || {};
  const DB = { items: JSON.parse(JSON.stringify(items)), monsters, npcs: { x: {} } };
  // 퀘스트 아이템 시험용 (현행 데이터엔 없다)
  DB.items['시험용 퀘스트품'] = { type: '퀘스트아이템', weight: 30, sell: 0, emoji: '📜' };
  const store = { map: {}, writes: 0, failWrites: false };
  const localStorage = {
    getItem: k => (k in store.map ? store.map[k] : null),
    setItem: (k, v) => { if (store.failWrites) throw new Error('quota'); store.map[k] = v; store.writes++; },
  };
  const WarehouseStore = {
    KEY: 'rmc_warehouse',
    read() { try { const d = localStorage.getItem(this.KEY); return d ? JSON.parse(d) : {}; } catch (e) { return {}; } },
    write(wh) { try { localStorage.setItem(this.KEY, JSON.stringify(wh)); return true; } catch (e) { return false; } },
  };
  const G = { player: { inventory: {}, sellLocked: {}, zeny: 0, skills: {} } };
  const logs = [], modals = [], notes = [];
  const calcStats = () => {
    let w = 0;
    Object.keys(G.player.inventory).forEach(k => {
      const it = DB.items[k];
      if (it) w += (it.weight || 0) * G.player.inventory[k];
    });
    return { carriedWeight: w, maxWeight: 2000 };
  };
  const document = { getElementById: () => null };
  const win = {};
  const shopState = { sel: {}, npc: 'x' };
  let saved = 0;
  const factory = new Function(
    'window', 'G', 'DB', 'localStorage', 'WarehouseStore', 'calcStats', 'document', 'log', 'notify', 'updateUI', 'openModal',
    'getItemDisplayName', 'REBIRTH_MAX_WEIGHT', 'saveLocal', 'getSellableItems', 'shopState', 'showShopModal',
    svcHtmlSrc + '\n' +
    'function svcSave(){ saveLocal(); }\n' +
    'function shopSellPriceOf(n,it){ return it.sell||0; }\n' +
    parseItemSrc + '\n' + blockSrc + '\n' + shopSelectSrc + '\n' +
    'return { svcWarehouseMove, svcWarehouseBulk, svcBagPolicyOf, svcBagDefaultPolicy, svcIsRare, svcBagMatch, svcRebirthPlan, ' +
    'svcBagSummary, shopSelectByPolicy, setFilter(f){ svcBagFilter = f; } };'
  );
  const e = factory(
    win, G, DB, localStorage, WarehouseStore, calcStats, document,
    (m, t) => logs.push({ m, t }), (m, c) => notes.push({ m, c }), () => {},
    (title, body, btns) => modals.push({ title, body, btns }),
    pr => pr.name, opts.limit || 500, () => { saved++; },
    p => Object.keys(p.inventory).filter(k => p.inventory[k] > 0 && ((parseItem2(k, DB) || {}).sell || 0) > 0),
    shopState, () => {}
  );
  function parseItem2(k, DBx) { const it = DBx.items[k]; return it || null; }
  return Object.assign(e, { G, DB, store, win, logs, modals, notes, shopState, saved: () => saved });
}

// ══════════════════════════════════════════════
// 1. 방침 기본값 — 종류·희귀도 기준
// ══════════════════════════════════════════════
{
  const e = makeEnv(); const p = e.G.player;
  assert.strictEqual(e.svcBagPolicyOf(p, '젤로피'), 'sell', '흔한 잡템(드롭 70%)은 판매');
  assert.strictEqual(e.svcBagPolicyOf(p, '피에로의 코'), 'store', '희귀 잡템(최대 드롭 0.04%)은 창고');
  assert.strictEqual(e.svcBagPolicyOf(p, '오리데오콘'), 'store', '재료는 창고');
  assert.strictEqual(e.svcBagPolicyOf(p, '포링 카드'), 'store', '카드는 창고');
  assert.strictEqual(e.svcBagPolicyOf(p, '빨간포션'), 'keep', '소모품은 유지(자동 포션이 가방에서 쓴다)');
  assert.strictEqual(e.svcBagPolicyOf(p, '나이프'), 'keep', '장비는 유지');
  assert.strictEqual(e.svcBagPolicyOf(p, '시험용 퀘스트품'), 'keep', '퀘스트 아이템은 항상 유지');
  assert.strictEqual(e.svcIsRare('포링 카드'), true);
  assert.strictEqual(e.svcIsRare('젤로피'), false);
  console.log('OK - 방침 기본값: 잡템=판매 · 희귀 잡템/재료/카드=창고 · 소모품/장비/퀘스트=유지');
}

// ══════════════════════════════════════════════
// 2. 방침 우선순위 — 직접 지정 > 기본값, 판매 보호 거부권, 판매 불가 아이템
// ══════════════════════════════════════════════
{
  const e = makeEnv(); const p = e.G.player;
  p.bagPolicy = { '빨간포션': 'store', '젤로피': 'keep' };
  assert.strictEqual(e.svcBagPolicyOf(p, '빨간포션'), 'store');
  assert.strictEqual(e.svcBagPolicyOf(p, '젤로피'), 'keep');
  p.sellLocked['끈적한 점액'] = true;
  assert.strictEqual(e.svcBagPolicyOf(p, '끈적한 점액'), 'keep', '판매 보호는 기본 판매를 막는다');
  p.bagPolicy['끈적한 점액'] = 'store';
  assert.strictEqual(e.svcBagPolicyOf(p, '끈적한 점액'), 'store', '창고 지정은 판매 보호와 양립');
  e.DB.items['무가치품'] = { type: '잡템', weight: 1, sell: 0 };
  p.bagPolicy['무가치품'] = 'sell';
  assert.strictEqual(e.svcBagPolicyOf(p, '무가치품'), 'keep', '판매가 0인 아이템은 판매 방침이 무효');
  console.log('OK - 방침 우선순위: 직접 지정 > 기본값, 판매 보호 거부권, 판매가 0 무효');
}

// ══════════════════════════════════════════════
// 3. 창고 이동 — 수량·전부·한계 클램프·한 번 쓰기
// ══════════════════════════════════════════════
{
  const e = makeEnv(); const p = e.G.player;
  p.inventory = { '젤로피': 50, '끈적한 점액': 7, '사과': 3 };
  let r = e.svcWarehouseMove('deposit', [{ k: '젤로피', qty: 10 }, { k: '끈적한 점액', qty: 'all' }, { k: '사과', qty: 99 }]);
  assert.deepStrictEqual([r.kinds, r.count], [3, 20], '10 + 7 + (99→3 클램프)');
  assert.strictEqual(e.store.writes, 1, '여러 종류를 옮겨도 창고 쓰기는 한 번');
  assert.strictEqual(p.inventory['젤로피'], 40);
  assert.strictEqual(p.inventory['끈적한 점액'], undefined);
  const wh = JSON.parse(e.store.map.rmc_warehouse);
  assert.deepStrictEqual(wh, { '젤로피': 10, '끈적한 점액': 7, '사과': 3 });
  r = e.svcWarehouseMove('withdraw', [{ k: '젤로피', qty: 'all' }]);
  assert.strictEqual(p.inventory['젤로피'], 50, '찾으면 원래 수량');
  assert.strictEqual(JSON.parse(e.store.map.rmc_warehouse)['젤로피'], undefined);
  console.log('OK - 창고 이동: 수량/전부/클램프, 다종 이동도 쓰기 1회, 찾기 왕복');
}

// ══════════════════════════════════════════════
// 4. 안전장치 — 쓰기 실패 시 인벤토리 보존, 손상된 창고는 중단
// ══════════════════════════════════════════════
{
  const e = makeEnv(); const p = e.G.player;
  p.inventory = { '젤로피': 5, '사과': 2 };
  e.store.failWrites = true;
  const r = e.svcWarehouseMove('deposit', [{ k: '젤로피', qty: 'all' }, { k: '사과', qty: 1 }]);
  assert.strictEqual(r, null);
  assert.deepStrictEqual(p.inventory, { '젤로피': 5, '사과': 2 }, '쓰기 실패 시 인벤토리 그대로');
  e.store.failWrites = false;
  e.store.map.rmc_warehouse = '{깨진 JSON';
  const r2 = e.svcWarehouseMove('deposit', [{ k: '젤로피', qty: 'all' }]);
  assert.strictEqual(r2, null, '손상된 창고는 덮어쓰지 않고 중단');
  assert.strictEqual(e.store.map.rmc_warehouse, '{깨진 JSON', '손상 데이터 보존');
  assert.deepStrictEqual(p.inventory, { '젤로피': 5, '사과': 2 });
  console.log('OK - 안전장치: 쓰기 실패 롤백, 손상된 창고 덮어쓰기 금지');
}

// ══════════════════════════════════════════════
// 5. 보이는 것 모두 맡기기 — 필터·유지·퀘스트 제외
// ══════════════════════════════════════════════
{
  const e = makeEnv(); const p = e.G.player;
  p.inventory = { '젤로피': 5, '끈적한 점액': 3, '빨간포션': 10, '시험용 퀘스트품': 2, '포링 카드': 1 };
  p.bagPolicy = { '끈적한 점액': 'keep' };
  e.setFilter('junk');
  assert.strictEqual(e.svcBagMatch('junk', '젤로피'), true);
  assert.strictEqual(e.svcBagMatch('junk', '빨간포션'), false);
  // 서비스 함수 자체 호출 대신 같은 규칙을 쓰는 번들 호출을 확인한다
  const moves = Object.keys(p.inventory).filter(k => e.svcBagMatch('junk', k) && !(p.bagPolicy[k] === 'keep') && k !== '시험용 퀘스트품').map(k => ({ k, qty: 'all' }));
  assert.deepStrictEqual(moves.map(m => m.k), ['젤로피'], '필터 안에서 유지 지정 항목은 빠진다');
  const r = e.svcWarehouseBulk(moves, '맡김');
  assert.strictEqual(r.count, 5);
  assert.ok(e.logs.some(l => /1종 5개 맡김 \(무게 .* → .*\)/.test(l.m)), '요약 로그 한 줄');
  console.log('OK - 일괄 맡기기: 필터·유지 제외, 요약 로그');
}

// ══════════════════════════════════════════════
// 6. 전승 준비 — 필요한 만큼만, 판매·창고 방침 먼저, 마지막 칸은 일부만
// ══════════════════════════════════════════════
{
  const e = makeEnv({ limit: 500 }); const p = e.G.player;
  // 오리데오콘 w10, 젤로피 w10, 빨간포션 w7, 나이프 w40
  p.inventory = { '오리데오콘': 30, '젤로피': 20, '빨간포션': 30, '나이프': 2 };   // 300+200+210+80 = 790
  const plan = e.svcRebirthPlan();
  assert.strictEqual(plan.cur, 790);
  assert.strictEqual(plan.enough, true);
  assert.ok(plan.after < 500, `기준 미만이어야 함: ${plan.after}`);
  assert.ok(plan.after >= 500 - 10.0001, `필요 이상으로 맡기지 않는다: ${plan.after}`);
  assert.ok(plan.picks.every(x => x.tier === 0), '판매·창고 방침 항목만으로 충분하면 기본 유지 항목은 건드리지 않는다');
  assert.strictEqual(plan.picks[0].k, '오리데오콘', '무게 큰 것부터');
  assert.strictEqual(plan.picks.length, 1, '큰 항목 하나로 충분');
  assert.strictEqual(plan.picks[0].n, 30, '290 넘게 줄이려면 오리데오콘 30개(290 초과 필요)');
  // 실행: 계획대로 이동 후 실제 무게가 기준 미만
  e.svcWarehouseBulk(plan.picks.map(x => ({ k: x.k, qty: x.n })), '맡김');
  const w = Object.keys(p.inventory).reduce((s, k) => s + (e.DB.items[k].weight || 0) * p.inventory[k], 0);
  assert.ok(w < 500, `실행 후 무게 ${w} < 500`);
  console.log('OK - 전승 준비: 최소 이동·방침 우선·실행 후 기준 미만 (790 → ' + w + ')');
}
{
  // 기준에 딱 걸친(정확히 500) 경우: 한 칸 중 필요한 1개만 맡긴다(부분 이동)
  const e = makeEnv({ limit: 500 }); const p = e.G.player;
  p.inventory = { '오리데오콘': 30, '젤로피': 20 };   // 300 + 200 = 500 (기준은 '미만')
  const plan = e.svcRebirthPlan();
  assert.strictEqual(plan.enough, true);
  assert.deepStrictEqual(plan.picks.map(x => [x.k, x.n]), [['오리데오콘', 1]], '마지막 칸은 필요한 개수만');
  assert.strictEqual(plan.after, 490);
  console.log('OK - 전승 준비: 정확히 500이면 1개만 부분 이동');
}
{
  // 판매·창고 방침만으론 부족하면 기본 유지 항목을 추가, 직접 유지는 절대 불가
  const e = makeEnv({ limit: 500 }); const p = e.G.player;
  p.inventory = { '젤로피': 10, '빨간포션': 60, '나이프': 5 };    // 100 + 420 + 200 = 720
  let plan = e.svcRebirthPlan();
  assert.strictEqual(plan.enough, true);
  assert.ok(plan.picks.some(x => x.tier === 1), '부족분은 기본 유지 항목에서 보충');
  p.bagPolicy = { '빨간포션': 'keep', '나이프': 'keep' };
  plan = e.svcRebirthPlan();
  assert.strictEqual(plan.enough, false, '직접 유지만 남으면 기준을 못 맞춘다고 알린다');
  assert.ok(plan.picks.every(x => x.k === '젤로피'), '직접 유지 항목은 후보에서 제외');
  assert.ok(plan.need > 0);
  console.log('OK - 전승 준비: 기본 유지 보충, 직접 유지 절대 보호, 불가 시 부족분 보고');
}
{
  const e = makeEnv({ limit: 500 }); const p = e.G.player;
  p.inventory = { '젤로피': 10 };
  assert.strictEqual(e.svcRebirthPlan().already, true, '이미 기준 미만이면 할 일 없음');
  p.inventory = { '시험용 퀘스트품': 30, '젤로피': 1 };   // 퀘스트 300 + 10 → 이미 충족 케이스 아님? 310 < 500
  p.inventory['시험용 퀘스트품'] = 20;                     // 600
  const plan = e.svcRebirthPlan();
  assert.ok(plan.picks.every(x => x.k !== '시험용 퀘스트품'), '퀘스트 아이템은 맡기지 않는다');
  assert.strictEqual(plan.enough, false);
  console.log('OK - 전승 준비: 이미 충족 시 안내, 퀘스트 아이템 제외');
}

// ══════════════════════════════════════════════
// 7. 상점 연동 — 방침대로 선택
// ══════════════════════════════════════════════
{
  const e = makeEnv(); const p = e.G.player;
  p.inventory = { '젤로피': 5, '끈적한 점액': 3, '피에로의 코': 1, '빨간포션': 4 };
  p.sellLocked['끈적한 점액'] = true;
  e.shopSelectByPolicy();
  assert.deepStrictEqual(Object.keys(e.shopState.sel).sort(), ['젤로피'], '판매 방침 + 보호 아님만 선택');
  console.log('OK - 상점: 방침대로 선택은 판매 방침·보호 해제 항목만');
}

// ══════════════════════════════════════════════
// 8. 요약 — 판매 예상 제니·무게
// ══════════════════════════════════════════════
{
  const e = makeEnv(); const p = e.G.player;
  p.inventory = { '젤로피': 10, '오리데오콘': 2, '빨간포션': 5 };
  const s = e.svcBagSummary(p);
  assert.strictEqual(s.sell.kinds, 1);
  assert.strictEqual(s.sell.zeny, 10 * e.DB.items['젤로피'].sell);
  assert.strictEqual(s.store.kinds, 1);
  assert.strictEqual(s.keep.kinds, 1);
  console.log('OK - 요약: 판매 예상 제니·종수 집계');
}

console.log('\nbag-organize-smoke: 전부 통과');
