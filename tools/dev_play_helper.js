// 로컬 화면 확인용 도우미 (개발 전용 — 빌드 결과물에는 들어가지 않는다).
// 로컬 서버(python -m http.server)로 저장소 루트를 띄운 뒤 index.html 콘솔에서:
//   await import('/tools/dev_play_helper.js?' + Date.now());
//   await devPlay.make(0, '시험');        // 0번 칸에 노비스를 만들고 바로 접속 (칸이 차 있으면 그 캐릭터로 접속)
//   devPlay.strong();                     // 맞아 죽지 않게 능력치·체력 올림
//   devPlay.pet('PORING');                // 펫 붙이기 (null이면 떼기)
//   devPlay.goto('pay_dun00');            // 맵 이동(걷지 않고 바로) + 화면 갱신
//   devPlay.hunt(600);                    // 온라인 전투 경로로 n턴 사냥 -> { kills, gained, logs }
// 결과는 실제 게임 함수(spawnMonsters·processTurn·rollDrops)를 그대로 거친다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function make(slot = 0, name = '시험') {
  if (typeof G !== 'undefined' && G.player) return G.player;
  if (!slots[slot]) {
    createCharacter(slot);
    await sleep(200);
    document.getElementById('nn').value = name;
    const ok = [...document.querySelectorAll('#modal-overlay button')].find((b) => b.textContent.trim() === '생성');
    if (!ok) throw new Error('생성 버튼을 찾지 못함');
    ok.click();
    await sleep(300);
  }
  loadCharacter(slot);
  await sleep(500);
  return G.player;
}

function strong() {
  const p = G.player;
  Object.assign(p, { str: 99, agi: 99, vit: 99, dex: 99 });
  if (typeof updateUI === 'function') updateUI();
  return p;
}

function pet(key = 'PORING') {
  const p = G.player;
  companionNormalize(p);
  p.companions.pet = key ? companionCreatePet(key, Date.now()) : null;
  return p.companions.pet;
}

function goto(mapRef) {
  if (!getMap(mapRef)) throw new Error('없는 맵: ' + mapRef);
  G.battles = [];
  G.currentMap = mapRef;
  if (typeof updateUI === 'function') updateUI();
  return mapLabel(mapRef);
}

function hunt(turns = 600) {
  const p = G.player, k0 = p.totalKills || 0, inv0 = { ...p.inventory };
  // 화면 로그는 200줄에서 잘리므로 log 함수를 잠시 감싸 이번 사냥의 줄을 모두 받는다(태그 제거)
  const logs = [], realLog = window.log;
  window.log = function (t, c, imp) { logs.push(String(t).replace(/<[^>]+>/g, '')); return realLog.call(this, t, c, imp); };
  let error = null;
  try {
    for (let i = 0; i < turns && !error; i++) {
      try { if (!G.battles.length) spawnMonsters(); processTurn(); } catch (e) { error = e.message; }
      p.hp = p.maxHp || p.hp;
    }
  } finally { window.log = realLog; }
  const gained = {};
  for (const k in p.inventory) { const d = p.inventory[k] - (inv0[k] || 0); if (d > 0) gained[k] = d; }
  return { kills: (p.totalKills || 0) - k0, map: G.currentMap, gained, error, logs, find: (re) => logs.filter((l) => re.test(l)) };
}

window.devPlay = { make, strong, pet, goto, hunt };
export default window.devPlay;
