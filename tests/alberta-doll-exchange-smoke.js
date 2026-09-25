const fs = require('fs');
const assert = require('assert');

const npcs = JSON.parse(fs.readFileSync('source/data/db-npcs.json','utf8'));
const items = JSON.parse(fs.readFileSync('source/data/db-items.json','utf8'));
const monsters = JSON.parse(fs.readFileSync('source/data/db-monsters.json','utf8'));

assert(!npcs['울고 있는 소녀'], '가공 NPC 울고 있는 소녀가 남아 있음');

const child = npcs['꼬마아이'];
assert(child, '알베르타 꼬마아이 누락');
assert.strictEqual(child.map, '알베르타');
assert.strictEqual(child.service, 'exchange');
assert(Array.isArray(child.exchanges) && child.exchanges.length >= 1, '인형 교환식 누락');

const expectedOutputs = new Set(['사탕','캔디 스트라이퍼']);
const acceptedDolls = new Set();
for (const r of child.exchanges) {
  for (const [item, qty] of Object.entries(r.give || {})) {
    assert(items[item], `교환 입력 아이템 DB 누락: ${item}`);
    assert.strictEqual(qty, 1, `인형은 1개씩 교환해야 함: ${item}`);
    acceptedDolls.add(item);
  }
  assert(r.random && Array.isArray(r.random.pool), '사탕/막대사탕 랜덤 보상 누락');
  assert.strictEqual(r.random.rolls, 1, '교환 1회당 보상은 1개여야 함');
  assert.deepStrictEqual(new Set(r.random.pool), expectedOutputs, '보상 풀은 사탕/막대사탕이어야 함');
  for (const item of r.random.pool) assert(items[item], `교환 출력 아이템 DB 누락: ${item}`);
}

assert(acceptedDolls.has('바포메트 인형'), '바포메트 인형 교환 누락');
const bapho = Object.values(monsters).find(m => m && m.name === '바포메트');
assert(bapho && bapho.drops && bapho.drops['바포메트 인형'] > 0, '바포메트 인형 실제 획득처 누락');

const obtainable = new Set();
for (const m of Object.values(monsters)) {
  for (const k of Object.keys((m && m.drops) || {})) obtainable.add(k);
}
for (const doll of acceptedDolls) {
  assert(obtainable.has(doll), `현재 몬스터 DB에서 획득할 수 없는 인형을 교환식에 넣음: ${doll}`);
}

console.log('OK - Alberta original doll exchange replacement smoke');
