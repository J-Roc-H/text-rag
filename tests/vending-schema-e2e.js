#!/usr/bin/env node
/*
 * P1-15 노점 스키마 + 판매 기록 + 세이브 v2 + 창고 단일 경계 회귀.
 * 실행: node tests/vending-schema-e2e.js   (사전 조건: index.html 빌드, playwright chromium)
 * 실제 빌드 산출물(index.html)을 브라우저에 올려 실제 함수를 호출한다(재구현 아님).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const t = path.resolve(ROOT, path.normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^[/\\]+/, '') || 'index.html');
      if (!t.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(t, (e, b) => e ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(b));
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'networkidle' });
    await page.locator('.char-slot.empty').first().click();
    await page.locator('#nn').fill('노점 E2E');
    await page.getByRole('button', { name: '생성', exact: true }).click();
    await page.locator('.char-slot:not(.empty)').first().click();
    await page.waitForFunction(() => typeof G !== 'undefined' && G.player);

    const r = await page.evaluate(() => {
      const out = {};
      // ① v1 세이브 -> v2: 판매 기록/판매자 ID 보강, 멱등
      const v1 = JSON.parse(JSON.stringify(G.player));
      v1.saveVersion = 1; delete v1.salesLog; delete v1.sellerId;
      const a = loadPlayerData(v1), b = loadPlayerData(a);
      out.ver = a.saveVersion; out.log0 = a.salesLog; out.seller0 = a.sellerId;
      out.idem = JSON.stringify(a) === JSON.stringify(b);
      // 링버퍼 상한
      const big = JSON.parse(JSON.stringify(a)); big.salesLog = Array.from({ length: 450 }, (_, i) => ({ stallId: 's', itemId: 'x', qty: 1, price: i, soldAt: i }));
      const c = loadPlayerData(big);
      out.capLen = c.salesLog.length; out.capFirst = c.salesLog[0].price;
      // 미래 버전 가져오기 거부
      try { checkImportedCharacter(Object.assign({}, a, { saveVersion: SAVE_SCHEMA_VERSION + 1 })); out.newerRejected = false; } catch (e) { out.newerRejected = true; }

      // ② 노점 개설 -> 슬롯 스키마
      const p = G.player;
      p.zeny = 0; p.records = p.records || {};
      const item = Object.keys(DB.items).find(k => DB.items[k].type === '소모품' && DB.items[k].buy);
      p.inventory[item] = 5;
      showVendingModal(1);
      window.__vs[0].item = item; window.__vs[0].price = DB.items[item].buy; window.__vs[0].qty = 3;
      window.__vOpen();
      out.item = item; out.slot = JSON.parse(JSON.stringify(G.vendingSlots[0])); out.invAfterOpen = p.inventory[item]; out.sellerId = p.sellerId;
      // ③ 판매 2건 강제(구매확률 0.95 상한 -> random=0이면 항상 판매)
      const rnd = Math.random; Math.random = () => 0;
      try {
        G.lastVendingCheck = 1; checkVending();
        G.lastVendingCheck = 1; checkVending();
      } finally { Math.random = rnd; }
      out.qtyLeft = G.vendingSlots[0].quantity; out.zeny = p.zeny; out.totalVending = p.records.totalVendingZeny;
      out.salesLog = JSON.parse(JSON.stringify(p.salesLog));
      // ④ 닫기: 잔여 회수
      showVendingStatus(); window.__vClose();
      out.invAfterClose = p.inventory[item]; out.slotsAfterClose = G.vendingSlots.length;
      // ⑤ 창고 단일 경계
      WarehouseStore.write({ 테스트: 2 });
      out.wh = readWarehouse(); out.whRaw = localStorage.getItem('rmc_warehouse');
      // ⑥ 검증 게이트
      out.gate5 = (function () { const l1 = loadPlayerData(G.player), l2 = loadPlayerData(l1); return JSON.stringify(l1) === JSON.stringify(l2); })();
      return out;
    });

    assert.equal(r.ver, 2); assert.deepEqual(r.log0, []); assert.equal(r.seller0, null); assert.ok(r.idem, 'v1→v2 멱등');
    assert.equal(r.capLen, 200); assert.equal(r.capFirst, 250, '링버퍼는 최신 200건 유지');
    assert.ok(r.newerRejected, '미래 버전 세이브 거부');
    assert.deepEqual(Object.keys(r.slot).sort(), ['createdAt', 'itemId', 'price', 'quantity', 'sellerId', 'stallId']);
    assert.equal(r.slot.itemId, r.item); assert.equal(r.slot.quantity, 3); assert.ok(r.slot.stallId && r.slot.sellerId === r.sellerId);
    assert.equal(r.invAfterOpen, 2, '개설 시 재고 차감(기존 동작)');
    assert.equal(r.qtyLeft, 1); assert.equal(r.salesLog.length, 2);
    r.salesLog.forEach(s => { assert.deepEqual(Object.keys(s).sort(), ['itemId', 'price', 'qty', 'soldAt', 'stallId']); assert.equal(s.stallId, r.slot.stallId); assert.equal(s.itemId, r.item); assert.equal(s.qty, 1); });
    assert.equal(r.zeny, r.slot.price * 2); assert.equal(r.totalVending, r.slot.price * 2, '누적 판매액 기록(기존 동작)');
    assert.equal(r.invAfterClose, 3, '잔여 1개 회수'); assert.equal(r.slotsAfterClose, 0);
    assert.deepEqual(r.wh, { 테스트: 2 }); assert.equal(r.whRaw, '{"테스트":2}');
    assert.ok(r.gate5);
    assert.deepEqual(errors, []);
    console.log('OK: vending schema / salesLog ring buffer / save v2 / WarehouseStore');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
