'use strict';
// 목적지로 빠른 이동 (설계_원작맵1대1_프론테라시범 §5-1): 방문한 맵만으로 이어진 최단 경로를 한 칸씩 걷는다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'source', 'world-map.js'), 'utf8');
const maps = {
  '프론테라': { connected: ['prt_fild08', 'prt_fild05'], safe: true },
  prt_fild08: { mapId: 'prt_fild08', displayName: '프론테라 필드 08', connected: ['프론테라', 'prt_fild07', '이즈루드'] },
  prt_fild07: { mapId: 'prt_fild07', displayName: '프론테라 필드 07', connected: ['prt_fild08', 'prt_fild05'] },
  prt_fild05: { mapId: 'prt_fild05', displayName: '프론테라 필드 05', connected: ['프론테라', 'prt_fild07'] },
  '이즈루드': { connected: ['prt_fild08'], safe: true },
};
const logs = [], moves = [];
const ctx = {
  DB: { maps }, logs,
  G: { currentMap: '프론테라', autoHunt: false, battles: [], player: { visitedMaps: { '프론테라': true, prt_fild08: true, '이즈루드': true } } },
  getMap: (r) => maps[r] || Object.values(maps).find((m) => m.displayName === r) || null,
  log: (m) => logs.push(String(m)), closeModal: () => {},
};
ctx.tryMove = (to) => { moves.push(to); ctx.G.currentMap = to; };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const visited = (r) => !!ctx.G.player.visitedMaps[r];

// 방문한 맵으로 이어지면 경로가 나온다
assert.strictEqual(JSON.stringify(ctx.worldMapVisitedRoute('프론테라', '이즈루드', visited)), JSON.stringify(['프론테라', 'prt_fild08', '이즈루드']));
// 방문 안 한 맵(prt_fild07)만 지나는 곳은 불가
assert.strictEqual(ctx.worldMapVisitedRoute('프론테라', 'prt_fild07', visited), null);
// 바로 옆이어도 처음 가는 곳(prt_fild05)은 빠른 이동 대상이 아니다
assert.strictEqual(ctx.worldMapVisitedRoute('프론테라', 'prt_fild05', visited), null);
// 제자리는 없음
assert.strictEqual(ctx.worldMapVisitedRoute('프론테라', '프론테라', visited), null);

// 자동사냥 중에는 시작하지 않음
ctx.G.autoHunt = true;
ctx.worldMapWalkTo('이즈루드');
assert.strictEqual(moves.length, 0);
assert(logs.some((l) => l.includes('자동사냥')));
ctx.G.autoHunt = false;

// 상세 화면의 행동: 걸어갈 수 있으면 단추, 아니면 사유
assert(ctx.worldMapActionHtml('이즈루드').includes('worldMapWalkTo'));
assert(!ctx.worldMapActionHtml('prt_fild07').includes('worldMapWalkTo'));

console.log('fast-travel-smoke: OK');
