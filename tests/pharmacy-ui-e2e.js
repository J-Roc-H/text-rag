#!/usr/bin/env node
/*
 * 파머시 실제 UI 회귀 검사.
 *
 * 실행: node tests/pharmacy-ui-e2e.js
 * 사전 조건: `npx playwright install chromium`
 *
 * 함수 직접 호출이 아니라 화면에서 캐릭터 생성 → 에디터 전직 → 스킬 메뉴 →
 * 파머시 → 제조 1회를 클릭한다. 에디터는 반복 가능한 테스트 상태를 준비하는
 * 개발용 UI일 뿐, 제조 진입과 실행은 모두 사용자 클릭 경로다.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent((request.url || '/').split('?')[0]);
      const safePath = path.normalize(pathname).replace(/^[/\\]+/, '');
      const target = path.resolve(ROOT, safePath || 'index.html');
      if (!target.startsWith(ROOT + path.sep) && target !== path.join(ROOT, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      fs.readFile(target, (error, body) => {
        if (error) {
          response.writeHead(404).end('Not found');
          return;
        }
        response.writeHead(200, { 'Content-Type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' });
        response.end(body);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function giveItem(page, name, quantity) {
  await page.locator('#e-item-filter').fill(name);
  await page.locator('#e-item-select').selectOption({ label: name });
  await page.locator('#e-item-qty').fill(String(quantity));
  await page.getByRole('button', { name: '🎒 선택한 아이템 지급', exact: true }).click();
}

async function main() {
  const server = await startServer();
  const { port } = server.address();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });

    // 캐릭터 생성도 실제 화면 조작으로 시작한다.
    await page.locator('.char-slot.empty').first().click();
    await page.locator('#nn').fill('파머시 E2E');
    await page.getByRole('button', { name: '생성', exact: true }).click();
    await page.locator('.char-slot:not(.empty)').first().click();

    // 반복 가능한 알케미스트/재료 상태는 게임 내 개발자 UI로 준비한다.
    await page.getByRole('button', { name: '☰ 메뉴', exact: true }).click();
    await page.getByRole('button', { name: '🛠 개발자', exact: true }).click();
    await page.getByRole('button', { name: '✏️ 에디터', exact: true }).click();
    await page.getByRole('button', { name: /⚗️ 알케미스트/ }).click();
    await page.getByRole('button', { name: '⭐ 현재 직업 스킬 전부 MAX 레벨', exact: true }).click();
    await page.locator('#e-dex').fill('99');
    await page.locator('#e-luk').fill('99'); // 성공률 100%로 고정
    await giveItem(page, '일반 포션 제조 메뉴얼', 1);
    await giveItem(page, '빨간 허브', 5);
    await giveItem(page, '빈 포션병', 5);
    await giveItem(page, '약사발', 5);
    await page.getByRole('button', { name: '적용', exact: true }).click();

    // 여기부터가 파머시의 실제 플레이어 경로다.
    await page.locator('#ctx-skill').click();
    await page.locator('#sknode-파머시').click();
    await page.getByRole('button', { name: '사용하기', exact: true }).click();
    await page.getByRole('button', { name: '1회', exact: true }).first().click();

    const craft = page.locator('#modal-overlay');
    await assert.doesNotReject(() => craft.getByText('빨간포션 x1', { exact: false }).waitFor());
    await assert.doesNotReject(() => page.locator('#game-log').getByText(/빨간포션 1회 제조 · 성공 1 \/ 실패 0/).waitFor());
    await assert.doesNotReject(() => craft.getByText(/빨간 허브 1 \(보유 4\).*빈 포션병 1 \(보유 4\)/).waitFor());
    await assert.doesNotReject(() => craft.getByText(/공용 소모: 약사발 1 \(보유 4\)/).first().waitFor());

    console.log('OK: pharmacy UI click path consumed all materials and made a red potion');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
