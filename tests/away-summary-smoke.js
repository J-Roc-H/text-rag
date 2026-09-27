'use strict';
// [방치 요약] smoke — 돌아왔을 때 요약 줄 규칙(사건 그룹핑·추정 표기·희귀 기준).
// source/template.html의 실제 awaySummaryLines 텍스트를 추출해 실행한다(창·배선은 브라우저 E2E로 확인).
const assert = require('assert');
const { extractBetween, html } = require('./_item-effect-harness');

const src = extractBetween(html, 'const AWAY_RARE_DROP_PCT', '// 다른 창(귀환 선물');
const api = (new Function(src + '\nreturn { AWAY_RARE_DROP_PCT, AWAY_MODAL_MIN_MS, awaySummaryLines };'))();

assert.strictEqual(api.AWAY_RARE_DROP_PCT, 1);
assert.strictEqual(api.AWAY_MODAL_MIN_MS, 5 * 60000);

const summary = {
  kills: 200, exp: 182712, jexp: 93880, zeny: 35010, deaths: 1,
  items: { '마타 카드': 3, '짐승의 가죽': 75 },
  sightings: [{ id: '138', name: '오시리스', map: '모로크 피라미드 4층', phase: 'extrapolate' }],
  events: [
    { kind: 'card', item: '마타 카드', phase: 'sample' },
    { kind: 'card', item: '마타 카드', phase: 'extrapolate' },
    { kind: 'card', item: '마타 카드', phase: 'extrapolate' },
    { kind: 'rare', item: '앙크 오브 파라오', phase: 'sample' },
  ],
  meta: { timeStr: '2시간 0분', map: '모로크 피라미드 4층', sampleMs: 30 * 60000, restMs: 90 * 60000, lv: [70, 71], jlv: [40, 40], potOut: true },
};
const text = api.awaySummaryLines(summary, true).join('\n');
assert(/처치 <b>200<\/b>/.test(text));
assert(/Base Lv 70→<b>71<\/b>/.test(text), '레벨업 표시');
assert(!/Job Lv/.test(text), '변화 없는 Job Lv는 생략');
assert(/<b>오시리스<\/b>의 기척.*추정/.test(text), '외삽 구간 기척은 추정 표기');
assert(/<b>마타 카드<\/b> ×3 <span class="away-est">추정 2<\/span>/.test(text), '카드 그룹핑 + 일부 추정 수');
assert(/희귀 드롭: <b>앙크 오브 파라오<\/b>(?! <span)/.test(text), '표본 구간 희귀 드롭은 추정 표기 없음');
assert(/1회 쓰러짐/.test(text));
assert(/자동 회복약이 떨어졌다/.test(text));
assert(/처음 30분은 실제 기록, 이후 1시간 30분은/.test(text), '표본/추정 구간 주석');

// 표본만 있는 짧은 부재 — 주석 없음, 사건 없음이면 주요 사건 헤더도 없음
const short = api.awaySummaryLines({ kills: 3, exp: 10, items: {}, meta: { timeStr: '1분 0초', sampleMs: 60000, restMs: 0 } }, false).join('\n');
assert(!/추정한 결과/.test(short));
assert(!/주요 사건/.test(short));

console.log('away-summary-smoke: PASS');
