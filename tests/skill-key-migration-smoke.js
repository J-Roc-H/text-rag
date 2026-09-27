'use strict';
// 스킬 키 정본화 마이그레이션 smoke — "포션 연구" → "러닝 포션"(AM_LEARNINGPOTION).
// source/template.html의 실제 SKILL_KEY_ALIASES/migrateSkillKeys 텍스트를 추출해 실행한다.
const assert = require('assert');
const { extractBetween, html } = require('./_item-effect-harness');

const src = extractBetween(html, 'const SKILL_KEY_ALIASES', 'function validateSave(data){');
const api = (new Function(src + '\nreturn { SKILL_KEY_ALIASES, migrateSkillKey, migrateSkillKeys };'))();

// 1. 옛 키가 세이브 전역(레벨·토글·핫바)에서 정본 키로 이동한다
{
  const p = {
    skills: { '포션 연구': 7, '파머시': 3 },
    skillToggles: { '포션 연구': false },
    hotbar: { Q: { type: 'skill', name: '포션 연구' }, W: { type: 'item', name: '포션 연구' } },
  };
  assert.strictEqual(api.migrateSkillKeys(p), true);
  assert.deepStrictEqual(p.skills, { '파머시': 3, '러닝 포션': 7 });
  assert.deepStrictEqual(p.skillToggles, { '러닝 포션': false });
  assert.strictEqual(p.hotbar.Q.name, '러닝 포션');
  assert.strictEqual(p.hotbar.W.name, '포션 연구', '아이템 슬롯은 스킬 별칭 대상이 아니다');
  // 멱등
  assert.strictEqual(api.migrateSkillKeys(p), false);
  assert.deepStrictEqual(p.skills, { '파머시': 3, '러닝 포션': 7 });
}

// 2. 두 키가 공존하면 레벨은 큰 값, 토글은 정본 쪽 값을 유지한다
{
  const p = { skills: { '포션 연구': 4, '러닝 포션': 6 }, skillToggles: { '포션 연구': false, '러닝 포션': true } };
  api.migrateSkillKeys(p);
  assert.deepStrictEqual(p.skills, { '러닝 포션': 6 });
  assert.deepStrictEqual(p.skillToggles, { '러닝 포션': true });
}

// 3. 레거시 구조(스킬/토글/핫바 없음)에서도 던지지 않는다
{
  assert.strictEqual(api.migrateSkillKeys({}), false);
  assert.strictEqual(api.migrateSkillKey(undefined), undefined);
}

// 4. 정본 DB에는 새 키만 남는다 — 별칭 target은 DB.skills 실재 키, 옛 이름은 표 밖에 없다
{
  for (const [oldKey, newKey] of Object.entries(api.SKILL_KEY_ALIASES)) {
    assert(html.includes(`"${newKey}":{`), `DB.skills에 정본 키 없음: ${newKey}`);
    assert(!html.includes(`"${oldKey}":{`), `DB.skills에 옛 키 잔존: ${oldKey}`);
    const outside = html.split(`"${oldKey}": "${newKey}"`).join('');
    assert(!outside.includes(`"${oldKey}"`), `옛 키 문자열 잔존: ${oldKey}`);
  }
  assert(html.includes('"SK_6202":"러닝 포션"'));
  assert(html.includes('req:{"러닝 포션":5}'));
}

console.log('skill-key-migration-smoke: PASS');
