// TextRAG UX hotfix: classic weight limit + hotbar item counts + item weight metadata.
// Scope: 2026-09-25 user-reported issues 1-3. Combat difficulty/movement remains a separate unimplemented task.
(function(){
  'use strict';

  const CLASSIC_JOB_WEIGHT = {
    JOB_NOV:0,
    JOB_SWD:800, JOB_ARC:600, JOB_THF:400, JOB_ACO:400, JOB_MER:800, JOB_MG:200,
    JOB_KNT:800, JOB_HNT:700, JOB_ASN:400, JOB_PRI:600, JOB_BSM:1000, JOB_WIZ:400,
    JOB_CRU:800, JOB_BRD:700, JOB_DNC:700, JOB_ROG:400, JOB_MNK:600, JOB_ALC:1000, JOB_SGE:400,
    JOB_HNOV:0,
    JOB_HSWD:800, JOB_HARC:600, JOB_HTHF:400, JOB_HACO:400, JOB_HMER:800, JOB_HMG:200,
    JOB_LKN:800, JOB_SNP:700, JOB_SIN:400, JOB_HPR:600, JOB_WHS:1000, JOB_HWZ:400,
    JOB_PAL:800, JOB_MIN:700, JOB_GYP:700, JOB_STK:400, JOB_CHP:600, JOB_CRT:1000, JOB_PRF:400
  };

  function currentJobCode(p){
    if(!p || typeof JOB_NAME2CODE==='undefined') return null;
    const jobName = typeof normalizeJob==='function' ? normalizeJob(p.job) : p.job;
    return JOB_NAME2CODE[jobName] || null;
  }

  function classicMaxWeight(p, s){
    const baseStr = Math.max(0, Number(s && s.baseStr) || 0);
    const jobBonus = CLASSIC_JOB_WEIGHT[currentJobCode(p)] || 0;
    const carryLv = Math.max(0, Number(p && p.skills && p.skills['소지량 증가']) || 0);

    // Existing TextRAG mount/cart modifiers are retained as game-specific modifiers.
    // Their values are intentionally not re-audited in this narrow hotfix.
    const mountBonus = Math.max(0, Number(p && p.mount && p.mount.effect && p.mount.effect.weightBonus) || 0);

    return 2000 + baseStr * 30 + jobBonus + carryLv * 200 + mountBonus;
  }

  if(typeof calcStats==='function'){
    const originalCalcStats = calcStats;
    calcStats = function(){
      const s = originalCalcStats.apply(this, arguments);
      const p = typeof G!=='undefined' ? G.player : null;
      if(!p || !s) return s;

      const maxWeight = classicMaxWeight(p, s);
      const carriedWeight = Math.max(0, Number(s.carriedWeight) || 0);
      const ratio = maxWeight > 0 ? carriedWeight / maxWeight : 0;

      s.maxWeight = maxWeight;
      s.weightRatio = ratio;
      // Keep the current TextRAG penalty thresholds; this patch fixes capacity, not penalty design.
      s.weightNoRegen = ratio > 0.5;
      s.weightNoAutoSkill = ratio > 0.7;
      return s;
    };
  }

  function ensureUxHotfixStyle(){
    if(document.getElementById('ux-hotfix-style')) return;
    const style = document.createElement('style');
    style.id = 'ux-hotfix-style';
    style.textContent = `
      .hotbar-slot{position:relative;}
      .hb-item-count{position:absolute;right:3px;bottom:1px;min-width:18px;padding:0 3px;border-radius:7px;background:rgba(255,255,255,.92);border:1px solid var(--border);font-size:10px;line-height:14px;text-align:center;font-weight:700;color:var(--text);pointer-events:none;}
      .hotbar-slot.item-empty .hb-icon,.hotbar-slot.item-empty .hb-name{opacity:.38;}
      .hotbar-slot.item-empty .hb-item-count{color:var(--red-light);border-color:var(--red-light);}
      .inv-weight-meta{font-size:10px;color:var(--text-dim);white-space:nowrap;}
      .item-weight-detail{margin:0 0 8px;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:rgba(0,0,0,.025);font-size:11px;color:var(--text-dim);}
    `;
    document.head.appendChild(style);
  }

  function itemCountFor(name){
    const p = typeof G!=='undefined' ? G.player : null;
    return Math.max(0, Number(p && p.inventory && p.inventory[name]) || 0);
  }

  if(typeof renderHotbar==='function'){
    const originalRenderHotbar = renderHotbar;
    renderHotbar = function(){
      const result = originalRenderHotbar.apply(this, arguments);
      ensureUxHotfixStyle();
      const p = typeof G!=='undefined' ? G.player : null;
      if(!p || typeof HOTBAR_KEYS==='undefined') return result;

      HOTBAR_KEYS.forEach(key=>{
        const slot = (p.hotbar||{})[key];
        if(!slot || slot.type!=='item') return;
        const el = document.getElementById('hb-slot-'+key);
        if(!el) return;
        const count = itemCountFor(slot.name);
        el.classList.toggle('item-empty', count<=0);
        const badge = document.createElement('span');
        badge.className = 'hb-item-count';
        badge.textContent = '×' + count;
        el.appendChild(badge);
        el.title = `${slot.name} · 보유 ${count}개 (${String(key).toUpperCase()})`;
      });
      return result;
    };
  }

  // Guarantee that a direct item use refreshes the displayed hotbar count immediately.
  if(typeof useItem==='function'){
    const originalUseItem = useItem;
    useItem = function(){
      const result = originalUseItem.apply(this, arguments);
      if(typeof renderHotbar==='function') renderHotbar();
      return result;
    };
  }

  function decodeHtmlText(text){
    const box = document.createElement('textarea');
    box.innerHTML = text;
    return box.value;
  }

  function itemFromKey(key){
    const parsed = typeof parseItem==='function' ? parseItem(key) : null;
    return {parsed, item:(parsed && parsed.base) || (typeof DB!=='undefined' && DB.items ? DB.items[key] : null)};
  }

  function decorateInventoryWeights(){
    ensureUxHotfixStyle();
    const body = document.getElementById('modal-body');
    if(!body) return;

    body.querySelectorAll('[onclick^="showItemDetail("]').forEach(row=>{
      const handler = row.getAttribute('onclick') || '';
      const match = handler.match(/^showItemDetail\('(.+)'\)$/);
      if(!match) return;
      const key = decodeHtmlText(match[1]);
      const found = itemFromKey(key);
      if(!found.item || found.item.weight==null) return;

      const infoBox = row.querySelector('b') && row.querySelector('b').parentElement;
      if(!infoBox || infoBox.querySelector('.inv-weight-meta')) return;

      const count = itemCountFor(key);
      const each = Number(found.item.weight) || 0;
      const total = each * count;
      const meta = document.createElement('span');
      meta.className = 'inv-weight-meta';
      meta.innerHTML = `<br>⚖ 무게 ${each}${count>1?` · 합계 ${total}`:''}`;
      infoBox.appendChild(meta);
    });
  }

  if(typeof showInvModal==='function'){
    const originalShowInvModal = showInvModal;
    showInvModal = function(){
      const result = originalShowInvModal.apply(this, arguments);
      decorateInventoryWeights();
      return result;
    };
  }

  if(typeof showItemDetail==='function'){
    const originalShowItemDetail = showItemDetail;
    showItemDetail = function(name){
      const result = originalShowItemDetail.apply(this, arguments);
      ensureUxHotfixStyle();
      const found = itemFromKey(name);
      if(!found.item || found.item.weight==null) return result;
      const body = document.getElementById('modal-body');
      if(!body || body.querySelector('.item-weight-detail')) return result;

      const count = itemCountFor(name);
      const each = Number(found.item.weight) || 0;
      const total = each * count;
      const line = document.createElement('div');
      line.className = 'item-weight-detail';
      line.textContent = `⚖ 무게 ${each}${count>1?` · 보유 ${count}개 총 ${total}`:''}`;
      body.insertBefore(line, body.firstChild);
      return result;
    };
  }
})();
