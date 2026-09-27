'use strict';
// [보스 기척] smoke — 자동은 멈추지 않는다: 자동 중 MVP는 기척으로 기록, 처치 후 원작 리젠 대기.
// source/template.html의 실제 헬퍼 텍스트를 추출해 실행한다(spawnMonsters 배선은 브라우저 E2E로 확인).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractBetween, html } = require('./_item-effect-harness');

const src = extractBetween(html, 'const BOSS_SIGHT_CHANCE', 'function spawnMonsters(){');
const respawn = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'source', 'data', 'db-mvp-respawn.json'), 'utf8'));
function makeApi(G, DB) {
  const logs = [];
  const api = (new Function('G', 'DB', 'logEvent', 'notify', 'openModal', 'toggleHunt', 'updateContextActions', 'log',
    src + '\nreturn { BOSS_CHARGE_CAP, MVP_RESPAWN_DEFAULT_MS, normalizeBossMode, getBossRecord, ensureBossRecord, mvpRespawnMs, isBossAlive, recordBossSighting, noteBossDefeat };'))(
    G, DB, (c, lines, t) => logs.push({ c, lines, t }), () => {}, () => {}, () => {}, () => {}, () => {});
  api.logs = logs;
  return api;
}
const DB = { mvpRespawn: respawn, monsters: { '138': { name: '오시리스', emoji: '👑' } } };

// 1. 옵션 이관: 구 값은 새 이름으로, 모르는 값은 기본(기척기록)
{
  const a = makeApi({}, DB);
  assert.strictEqual(a.normalizeBossMode('normal'), '기척기록');
  assert.strictEqual(a.normalizeBossMode('보스만사냥'), '보스우선탐사');
  assert.strictEqual(a.normalizeBossMode('조우하지않음'), '조우하지않음');
  assert.strictEqual(a.normalizeBossMode(undefined), '기척기록');
}

// 2. 기척: 서식지 기억 + 1회 충전, 상한 3, 오프라인 요약 집계
{
  const G = { silentSummary: { }, silentMode: true };
  const a = makeApi(G, DB), p = {};
  for (let i = 0; i < 5; i++) a.recordBossSighting(p, 138, '모로크 피라미드 4층');
  const r = a.getBossRecord(p, 138);
  assert.strictEqual(r.sightings, 5);
  assert.strictEqual(r.charges, a.BOSS_CHARGE_CAP);
  assert.deepStrictEqual(r.maps, ['모로크 피라미드 4층']);
  assert.strictEqual(G.silentSummary.sightings.length, 5);
  assert(/서식지를 기억해 두었다/.test(a.logs[0].lines.join('')), '첫 기척은 서식지 기억 문장');
}

// 3. 처치 → 원작 리젠(오시리스 moc_pryd04: 60분 + 0~10분) 동안 목격 불가, 지나면 가능
{
  const G = { player: {}, currentMap: '모로크 피라미드 4층' };
  const a = makeApi(G, DB);
  const t0 = Date.now();
  a.noteBossDefeat({ isMvp: true, sourceId: '138', name: '오시리스' });
  const r = a.getBossRecord(G.player, 138);
  assert.strictEqual(r.defeats, 1);
  assert.strictEqual(r.priorityPending, true);
  const wait = r.respawnAt - t0;
  assert(wait >= 3600000 && wait <= 3600000 + 600000 + 1000, `respawn ${wait}`);
  assert.strictEqual(a.isBossAlive(G.player, 138, t0 + 60000), false);
  assert.strictEqual(a.isBossAlive(G.player, 138, r.respawnAt), true);
  // 일반 몬스터·슬레이브(isMvp 아님)는 무시
  a.noteBossDefeat({ isMvp: false, sourceId: '1' });
  assert.strictEqual(a.getBossRecord(G.player, 1), null);
}

// 4. source-needed 보스는 추측 없이 게임 기본값
{
  const a = makeApi({}, DB);
  const sn = Object.keys(respawn).find(k => k[0] !== '_' && respawn[k].status === 'source-needed');
  assert(sn, 'source-needed 행 존재');
  assert.strictEqual(respawn[sn].delayMs, null);
  assert.strictEqual(a.mvpRespawnMs(sn), a.MVP_RESPAWN_DEFAULT_MS);
}

console.log('boss-sighting-smoke: PASS');
