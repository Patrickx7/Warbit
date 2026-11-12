import {
  ITEMS, ITEM_BY_ID, MAX_TOOLS, PRESETS, SCORE_TO_WIN, TEAM_CSS, TEAM_NAMES, buildLoadout, levelFromXp, priceFor, xpForLevel,
  type Item, type RosterEntry, type Zone, type ZoneWhere,
} from '@warbit/shared';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const money = (n: number) => '$' + Math.round(n).toLocaleString('pt-BR');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface StateView { phase: string; timeLeft: number; scores: number[]; presence: number[]; control: number; hzIn: number; winner: number; counts: number[] }
export interface ProfileView { cash: number; xp: number; level: number; lifeProfit: number; kills: number; deaths: number }
export interface MapDot { x: number; z: number; team: number; kind: 0 | 1 | 2 } // 0 aliado, 1 inimigo marcado, 2 aliado caído

export class UI {
  profile: ProfileView = { cash: 0, xp: 0, level: 1, lifeProfit: 0, kills: 0, deaths: 0 };
  private sel = new Set<string>();
  private centerTimer = 0;
  private hitTimer = 0;
  private hurtTimer = 0;
  private mm = $<HTMLCanvasElement>('minimap').getContext('2d')!;
  onSpawn: (items: string[], where: 'base' | 'forward') => void = () => {};

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('warbit.loadout') ?? '[]') as string[];
      for (const id of saved) if (ITEM_BY_ID[id]) this.sel.add(id);
    } catch { /* sem armazenamento: segue com o kit grátis */ }
    if (!this.sel.size) for (const id of PRESETS[1].items) this.sel.add(id);
    $('spawnFwd').onclick = () => this.onSpawn([...this.sel], 'forward');
    $('spawnBase').onclick = () => this.onSpawn([...this.sel], 'base');
    const pr = $('presets');
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.onclick = () => { this.sel = new Set(p.items); this.renderShop(); };
      pr.appendChild(b);
    }
    const sc = $('scores');
    for (let t = 0; t < 3; t++) {
      const d = document.createElement('div');
      d.className = 'score'; d.id = 'score' + t;
      d.innerHTML = `<div class="bar" style="background:${TEAM_CSS[t]}"></div><b style="color:${TEAM_CSS[t]}">0</b><span></span>`;
      sc.appendChild(d);
    }
  }

  show(id: string, on: boolean) { $(id).classList.toggle('hidden', !on); }

  // ---------- HUD ----------
  setState(s: StateView, myTeam: number) {
    for (let t = 0; t < 3; t++) {
      const d = $('score' + t);
      (d.querySelector('.bar') as HTMLElement).style.width = Math.min(100, (s.scores[t] / SCORE_TO_WIN) * 100) + '%';
      d.querySelector('b')!.textContent = String(Math.floor(s.scores[t]));
      d.querySelector('span')!.textContent = `${TEAM_NAMES[t]} · ${s.presence[t]} na zona`;
      d.classList.toggle('ctrl', s.control === t);
      d.classList.toggle('mine', t === myTeam);
    }
    const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    $('phase').textContent = s.phase === 'warmup' ? `Aquecimento · começa em ${s.timeLeft}s`
      : s.phase === 'end' ? `Fim de partida — ${TEAM_NAMES[s.winner] ?? ''} venceu · nova em ${s.timeLeft}s`
      : `Primeiro a ${SCORE_TO_WIN} vence · Hot Zone muda em ${mmss(s.hzIn)}`;
  }

  setZone(w: ZoneWhere, alive: boolean) {
    const el = $('zoneinfo');
    el.className = alive ? w : 'out';
    el.textContent = !alive ? '' : w === 'hz' ? 'HOT ZONE — você conta em dobro e ganha o dobro' : w === 'cz' ? 'Dentro da Control Zone' : 'Fora da zona — siga o feixe laranja';
  }

  setProfile(p: ProfileView) {
    this.profile = p;
    $('cash').textContent = money(p.cash);
    $('profit').textContent = money(p.lifeProfit);
    $('level').textContent = String(p.level);
    $('kd').textContent = `${p.kills} abates / ${p.deaths} mortes`;
    const a = xpForLevel(p.level), b = xpForLevel(p.level + 1);
    ($('xpbar').firstElementChild as HTMLElement).style.width = Math.max(0, Math.min(100, ((p.xp - a) / (b - a)) * 100)) + '%';
    $('shopCash').textContent = money(p.cash);
    if (!$('shop').classList.contains('hidden')) this.renderShop();
  }

  setVitals(hp: number, ammo: number, reserve: number, weapon: string, reloading: boolean) {
    $('hptext').textContent = String(Math.max(0, Math.ceil(hp)));
    const bar = $('hpbar').firstElementChild as HTMLElement;
    bar.style.width = Math.max(0, Math.min(100, hp)) + '%';
    bar.style.background = hp > 50 ? '#e9e9e9' : hp > 25 ? '#f5c542' : '#ef4444';
    $('ammo').innerHTML = `${reloading ? '…' : ammo} <small>/ ${reserve}</small>`;
    $('weapon').textContent = reloading ? `${weapon} — recarregando` : weapon;
  }

  setTools(list: { key: string; label: string; n?: number }[]) {
    $('tools').innerHTML = list.map((t) => `<span><kbd>${t.key}</kbd> ${esc(t.label)}${t.n !== undefined ? ` ×${t.n}` : ''}</span>`).join('');
  }

  feed(html: string) {
    const f = $('feed');
    const d = document.createElement('div');
    d.innerHTML = html;
    f.appendChild(d);
    while (f.children.length > 6) f.firstElementChild!.remove();
    setTimeout(() => d.remove(), 7000);
  }

  reward(label: string, cash: number, xp: number) {
    const r = $('rewards');
    const d = document.createElement('div');
    d.innerHTML = `${esc(label)} <em>+${money(cash)}</em> <small>+${xp} XP</small>`;
    r.appendChild(d);
    while (r.children.length > 6) r.firstElementChild!.remove();
    setTimeout(() => d.remove(), 2600);
  }

  center(text: string, ms = 3500) {
    const c = $('center');
    c.textContent = text;
    c.style.opacity = '1';
    clearTimeout(this.centerTimer);
    this.centerTimer = window.setTimeout(() => (c.style.opacity = '0'), ms);
  }

  hint(text: string | null) {
    const h = $('hint');
    h.classList.toggle('hidden', !text);
    if (text) h.textContent = text;
  }

  hitmarker(kill: boolean) {
    const h = $('hitmarker');
    h.classList.toggle('kill', kill);
    h.style.transition = 'none'; h.style.opacity = '1';
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => { h.style.transition = 'opacity .25s'; h.style.opacity = '0'; }, 60);
  }

  hurt() {
    const v = $('vignette');
    v.style.transition = 'none'; v.style.opacity = '1';
    clearTimeout(this.hurtTimer);
    this.hurtTimer = window.setTimeout(() => { v.style.transition = 'opacity .5s'; v.style.opacity = '0'; }, 80);
  }

  aim(scope: boolean, crosshair: boolean) {
    this.show('scope', scope);
    this.show('crosshair', crosshair && !scope);
  }

  downed(on: boolean, left = 0) {
    this.show('downed', on);
    if (on) $('downLeft').textContent = String(Math.max(0, Math.ceil(left)));
  }

  perf(text: string) { $('perf').textContent = text; }

  // ---------- loja ----------
  openShop(msg: string) {
    $('shopMsg').textContent = msg;
    $('shopErr').textContent = '';
    this.show('shop', true);
    this.renderShop();
  }
  closeShop() { this.show('shop', false); }
  shopError(e: string) { $('shopErr').textContent = e; }

  private toggle(it: Item) {
    if (this.sel.has(it.id)) { this.sel.delete(it.id); }
    else {
      if (it.slot !== 'tool') {
        for (const id of [...this.sel]) if (ITEM_BY_ID[id].slot === it.slot) this.sel.delete(id);
      } else {
        const tools = [...this.sel].filter((id) => ITEM_BY_ID[id].slot === 'tool');
        if (tools.length >= MAX_TOOLS) this.sel.delete(tools[0]);
        const clash = it.tool === 'revive' ? 'defib' : it.tool === 'defib' ? 'revive' : '';
        if (clash) for (const id of tools) if (ITEM_BY_ID[id].tool === clash) this.sel.delete(id);
      }
      this.sel.add(it.id);
    }
    try { localStorage.setItem('warbit.loadout', JSON.stringify([...this.sel])); } catch { /* ignora */ }
    this.renderShop();
  }

  private renderShop() {
    const lvl = this.profile.level;
    // descarta seleção que ficou inválida (nível, Fase 2)
    for (const id of [...this.sel]) { const it = ITEM_BY_ID[id]; if (!it || it.soon || it.level > lvl) this.sel.delete(id); }
    const groups: [string, (i: Item) => boolean][] = [
      ['Arma principal', (i) => i.slot === 'primary'], ['Arma secundária', (i) => i.slot === 'secondary'],
      ['Blindagem', (i) => i.slot === 'armor'], ['Capacete', (i) => i.slot === 'helmet'], ['Colete tático (munição)', (i) => i.slot === 'vest'],
      [`Ferramentas (até ${MAX_TOOLS})`, (i) => i.slot === 'tool'],
    ];
    const root = $('items');
    const scroll = root.scrollTop;
    root.innerHTML = '';
    for (const [title, f] of groups) {
      const h = document.createElement('h3'); h.textContent = title; root.appendChild(h);
      const grid = document.createElement('div'); grid.className = 'grid'; root.appendChild(grid);
      for (const it of ITEMS.filter(f)) {
        const locked = !!it.soon || it.level > lvl;
        const price = priceFor(it, lvl);
        const d = document.createElement('div');
        d.className = 'item' + (this.sel.has(it.id) ? ' sel' : '') + (locked ? ' locked' : '');
        const tag = it.soon ? 'em breve' : it.level > lvl ? `nível ${it.level}` : price === 0 ? 'grátis' : money(price);
        d.innerHTML = `<div class="n"><span>${esc(it.name)}</span><em>${tag}</em></div><div class="d">${esc(it.track)} · ${esc(it.desc)}</div>`;
        if (!locked) d.onclick = () => this.toggle(it);
        grid.appendChild(d);
      }
    }
    root.scrollTop = scroll;
    const res = buildLoadout([...this.sel], lvl, Infinity);
    const sum = $('summary');
    if (res.ok) {
      const lo = res.loadout;
      const rows = [lo.primary, lo.secondary, lo.armor, lo.helmet, lo.vest, ...lo.tools].filter(Boolean) as Item[];
      sum.innerHTML = rows.map((it) => `<div class="row"><span>${esc(it.name)}</span><span>${priceFor(it, lvl) === 0 ? 'grátis' : money(priceFor(it, lvl))}</span></div>`).join('')
        + (lvl <= 10 ? '<div class="note" style="margin-top:8px">Desconto de recruta: 50% até o nível 10.</div>' : '');
      $('totalV').textContent = money(lo.cost);
      $('shopErr').textContent = lo.cost > this.profile.cash ? 'Saldo insuficiente — remova itens ou use o kit grátis.' : '';
    } else {
      sum.innerHTML = '';
      $('shopErr').textContent = res.error;
    }
  }

  // ---------- placar ----------
  board(rows: { id: number; kills: number; deaths: number; score: number }[], roster: Map<number, RosterEntry>, myId: number) {
    const cols = $('boardCols');
    let html = '';
    for (let t = 0; t < 3; t++) {
      const list = rows.filter((r) => roster.get(r.id)?.team === t).sort((a, b) => b.score - a.score || b.kills - a.kills);
      html += `<div><h3 style="color:${TEAM_CSS[t]}">${TEAM_NAMES[t]} (${list.length})</h3><table><tr><th>Jogador</th><th>Pts</th><th>A</th><th>M</th></tr>`;
      for (const r of list) {
        const e = roster.get(r.id)!;
        html += `<tr class="${r.id === myId ? 'me' : e.bot ? 'bot' : ''}"><td>${esc(e.name)}</td><td>${r.score}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`;
      }
      html += '</table></div>';
    }
    cols.innerHTML = html;
  }

  // ---------- minimapa ----------
  minimap(px: number, pz: number, yaw: number, cz: Zone, hz: Zone, bases: { x: number; z: number }[], spawns: { x: number; z: number }[], dots: MapDot[], myTeam: number) {
    const c = this.mm, S = 210, H = S / 2;
    const scale = Math.max(0.28, Math.min(0.55, H / (Math.hypot(cz.x - px, cz.z - pz) + cz.r * 0.5)));
    c.clearRect(0, 0, S, S);
    const X = (x: number) => H + (x - px) * scale, Y = (z: number) => H + (z - pz) * scale;
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.fillStyle = 'rgba(255,255,255,.06)';
    c.beginPath(); c.arc(X(cz.x), Y(cz.z), cz.r * scale, 0, 6.2832); c.fill(); c.stroke();
    c.strokeStyle = '#ff8a1f'; c.fillStyle = 'rgba(255,138,31,.35)';
    c.beginPath(); c.arc(X(hz.x), Y(hz.z), Math.max(3, hz.r * scale), 0, 6.2832); c.fill(); c.stroke();
    bases.forEach((b, t) => { c.fillStyle = TEAM_CSS[t]; c.fillRect(X(b.x) - 5, Y(b.z) - 5, 10, 10); });
    spawns.forEach((s, t) => { c.strokeStyle = TEAM_CSS[t]; c.strokeRect(X(s.x) - 4, Y(s.z) - 4, 8, 8); });
    for (const d of dots) {
      const x = X(d.x), y = Y(d.z);
      if (x < 0 || y < 0 || x > S || y > S) continue;
      c.fillStyle = d.kind === 1 ? '#ff3030' : d.kind === 2 ? '#ffe14d' : TEAM_CSS[d.team];
      c.beginPath(); c.arc(x, y, d.kind === 1 ? 3.2 : 2.3, 0, 6.2832); c.fill();
    }
    // eu: seta apontando para onde olho (norte = -Z para cima)
    c.save(); c.translate(H, H); c.rotate(-yaw);
    c.fillStyle = '#fff'; c.strokeStyle = TEAM_CSS[myTeam]; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}

export { money, esc, levelFromXp };
