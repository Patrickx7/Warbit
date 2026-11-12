import {
  BoxKind, ITEMS, ITEM_BY_ID, MAX_TOOLS, SCORE_PER_PRESENCE_SECOND, SCORE_TO_WIN, Surface, TEAM_CSS, TEAM_NAMES, WORLD_SIZE, buildLoadout,
  levelFromXp, priceFor, xpForLevel, type Item, type RosterEntry, type World, type Zone, type ZoneWhere, type WeaponStats,
} from '@warbit/shared';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const money = (n: number) => '$' + Math.round(n).toLocaleString('pt-BR');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface StateView { phase: string; timeLeft: number; scores: number[]; presence: number[]; control: number; hzIn: number; winner: number; counts: number[] }
export interface ProfileView { cash: number; xp: number; level: number; lifeProfit: number; kills: number; deaths: number }
export interface MapDot { x: number; z: number; team: number; kind: 0 | 1 | 2 } // 0 aliado, 1 inimigo marcado, 2 aliado caído
export interface MapFob { team: number; x: number; z: number }

// ---------- categorias da loja ----------
interface Cat { id: string; label: string; match: (i: Item) => boolean }
const CATS: Cat[] = [
  { id: 'primary', label: 'Arma principal', match: (i) => i.slot === 'primary' && !i.soon },
  { id: 'secondary', label: 'Arma secundária', match: (i) => i.slot === 'secondary' && !i.soon },
  { id: 'sight', label: 'Miras', match: (i) => i.slot === 'sight' },
  { id: 'armor', label: 'Proteção', match: (i) => (i.slot === 'armor' || i.slot === 'helmet' || i.slot === 'vest') && !i.soon },
  { id: 'pack', label: 'Mochilas', match: (i) => i.slot === 'pack' },
  { id: 'medic', label: 'Médico', match: (i) => i.slot === 'tool' && i.track === 'Médica' && !i.soon },
  { id: 'build', label: 'Construção', match: (i) => i.slot === 'tool' && i.track === 'Construção' && !i.soon },
  { id: 'recon', label: 'Recon', match: (i) => i.slot === 'tool' && i.track === 'Recon' && !i.soon },
  { id: 'util', label: 'Utilitários', match: (i) => i.slot === 'tool' && i.track === 'Assalto' && !i.soon },
  { id: 'soon', label: 'Em breve', match: (i) => !!i.soon },
];

const GUN_SVG: Record<string, string> = {
  rifle: '<rect x="4" y="9" width="44" height="6" rx="1"/><rect x="48" y="10" width="26" height="3"/><rect x="14" y="14" width="7" height="10"/><rect x="2" y="7" width="14" height="9"/><rect x="26" y="5" width="12" height="4"/>',
  smg: '<rect x="8" y="9" width="34" height="7" rx="1"/><rect x="42" y="10" width="14" height="3"/><rect x="18" y="15" width="6" height="13"/><rect x="2" y="8" width="10" height="7"/><rect x="30" y="15" width="5" height="8"/>',
  shotgun: '<rect x="4" y="9" width="30" height="6" rx="1"/><rect x="34" y="9" width="44" height="3"/><rect x="34" y="13" width="30" height="3"/><rect x="2" y="7" width="14" height="10"/><rect x="40" y="12" width="14" height="4"/>',
  sniper: '<rect x="2" y="10" width="52" height="5" rx="1"/><rect x="54" y="11" width="22" height="2"/><rect x="26" y="4" width="22" height="5" rx="2"/><rect x="2" y="8" width="12" height="9"/><rect x="22" y="14" width="5" height="9"/>',
  pistol: '<rect x="14" y="8" width="38" height="7" rx="1"/><rect x="20" y="14" width="8" height="14" transform="rotate(8 24 21)"/>',
};
const sightSvg = (it: Item) => it.sight!.kind === 'scope'
  ? '<rect x="8" y="10" width="48" height="10" rx="4"/><rect x="2" y="8" width="8" height="14" rx="2"/><rect x="54" y="8" width="8" height="14" rx="2"/><rect x="26" y="20" width="10" height="6"/>'
  : '<rect x="10" y="6" width="40" height="3"/><rect x="10" y="21" width="40" height="3"/><rect x="10" y="6" width="3" height="18"/><rect x="47" y="6" width="3" height="18"/><circle cx="30" cy="15" r="2" fill="#ff4a4a"/>';
const packSvg = (t: number) => t === 1
  ? '<rect x="28" y="6" width="24" height="22" rx="4"/><rect x="30" y="3" width="20" height="6" rx="2"/>'
  : t === 2
    ? '<rect x="24" y="8" width="32" height="22" rx="4"/><rect x="22" y="2" width="36" height="7" rx="3"/><rect x="18" y="14" width="6" height="12" rx="2"/><rect x="56" y="14" width="6" height="12" rx="2"/>'
    : '<rect x="22" y="4" width="36" height="26" rx="5"/><rect x="14" y="10" width="8" height="16" rx="2"/><rect x="58" y="10" width="8" height="16" rx="2"/><rect x="28" y="16" width="24" height="12" rx="2" fill="#7d6e3c"/><rect x="26" y="0" width="28" height="6" rx="2"/>';
function silhouette(it: Item): string {
  const body = it.weapon ? GUN_SVG[it.weapon.cls] : it.sight ? sightSvg(it) : it.pack ? packSvg(it.pack) : '';
  if (!body) return '';
  return `<svg viewBox="0 0 80 30" class="sil">${body}</svg>`;
}

function bars(w: WeaponStats): string {
  const bar = (label: string, v: number, bad = false) =>
    `<div class="bar"><span>${label}</span><i><b class="${bad ? 'bad' : ''}" style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i></div>`;
  return bar('Dano', (w.dmg * (w.pellets ?? 1) * 0.5) / 55) + bar('Cadência', w.rpm / 900) + bar('Alcance', w.falloffEnd / 600) + bar('Recuo', w.recoil / 9, true);
}

export class UI {
  profile: ProfileView = { cash: 0, xp: 0, level: 1, lifeProfit: 0, kills: 0, deaths: 0 };
  /** nada vem marcado: o jogador escolhe item por item */
  private sel = new Set<string>();
  private cat = 'primary';
  private lastBuy: string[] = [];
  private waitUntil = 0;
  private centerTimer = 0;
  private hitTimer = 0;
  private hurtTimer = 0;
  private mm = $<HTMLCanvasElement>('minimap').getContext('2d')!;
  private mmBase: HTMLCanvasElement | null = null;
  private mmZoomIdx = 1;
  private static readonly MM_ZOOMS = [0.22, 0.45, 0.9, 1.8]; // pixels por metro
  onSpawn: (items: string[]) => void = () => {};
  /** chamado a cada mudança no carrinho: atualiza a prévia 3D do soldado */
  onPreview: (look: { armor: number; helmet: number; pack: number; gun: number }) => void = () => {};

  constructor() {
    try { this.lastBuy = (JSON.parse(localStorage.getItem('warbit.lastBuy') ?? '[]') as string[]).filter((id) => ITEM_BY_ID[id]); } catch { /* sem armazenamento */ }
    $('spawnBase').onclick = () => {
      if (Date.now() < this.waitUntil) return;
      const items = [...this.sel];
      this.lastBuy = items;
      try { localStorage.setItem('warbit.lastBuy', JSON.stringify(items)); } catch { /* ignora */ }
      this.onSpawn(items);
    };
    $('repeatBtn').onclick = () => { this.sel = new Set(this.lastBuy.filter((id) => this.available(ITEM_BY_ID[id]))); this.renderShop(); };
    $('clearBtn').onclick = () => { this.sel.clear(); this.renderShop(); };
    const tabs = $('tabs');
    for (const c of CATS) {
      const b = document.createElement('button');
      b.dataset.cat = c.id;
      b.textContent = c.label;
      b.onclick = () => { this.cat = c.id; this.renderShop(); };
      tabs.appendChild(b);
    }
    const sc = $('scores');
    for (let t = 0; t < 3; t++) {
      const d = document.createElement('div');
      d.className = 'score'; d.id = 'score' + t;
      d.innerHTML = `<div class="bar2" style="background:${TEAM_CSS[t]}"></div><b style="color:${TEAM_CSS[t]}">0</b><span></span>`;
      sc.appendChild(d);
    }
    setInterval(() => this.tickWait(), 250);
  }

  show(id: string, on: boolean) { $(id).classList.toggle('hidden', !on); }

  // ---------- HUD ----------
  setState(s: StateView, myTeam: number) {
    for (let t = 0; t < 3; t++) {
      const d = $('score' + t);
      (d.querySelector('.bar2') as HTMLElement).style.width = Math.min(100, (s.scores[t] / SCORE_TO_WIN) * 100) + '%';
      d.querySelector('b')!.textContent = s.scores[t].toFixed(1);
      const rate = s.control === t ? ` · +${(s.presence[t] * SCORE_PER_PRESENCE_SECOND).toFixed(2)}/s` : '';
      d.querySelector('span')!.textContent = `${TEAM_NAMES[t]} · ${s.presence[t]} na zona${rate}`;
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

  setVitals(hp: number, ammo: number, reserve: number, weapon: string, reloading: boolean, sight: string) {
    $('hptext').textContent = String(Math.max(0, Math.ceil(hp)));
    const bar = $('hpbar').firstElementChild as HTMLElement;
    bar.style.width = Math.max(0, Math.min(100, hp)) + '%';
    bar.style.background = hp > 50 ? '#e9e9e9' : hp > 25 ? '#f5c542' : '#ef4444';
    $('ammo').innerHTML = `${reloading ? '…' : ammo} <small>/ ${reserve}</small>`;
    $('weapon').textContent = (reloading ? `${weapon} — recarregando` : weapon) + (sight ? ` · ${sight}` : '');
  }

  setStamina(v: number, tired: boolean, stance: string) {
    const b = $('stambar').firstElementChild as HTMLElement;
    b.style.width = Math.round(v * 100) + '%';
    b.style.background = tired ? '#ef4444' : v < 0.35 ? '#f5c542' : '#7ee08a';
    $('stance').textContent = stance;
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

  /** overlay da luneta (só para mira com muito aumento). Não existe cruz na tela: mire com o botão direito. */
  aim(scope: boolean) { this.show('scope', scope); }

  downed(on: boolean, left = 0) {
    this.show('downed', on);
    if (on) $('downLeft').textContent = String(Math.max(0, Math.ceil(left)));
  }

  perf(text: string) { $('perf').textContent = text; }

  // ---------- loja ----------
  private available(it: Item | undefined): boolean {
    return !!it && !it.soon && it.level <= this.profile.level;
  }

  openShop(msg: string, waitSeconds = 0) {
    $('shopMsg').textContent = msg;
    $('shopErr').textContent = '';
    this.sel.clear(); // nunca vem nada marcado
    this.waitUntil = Date.now() + waitSeconds * 1000;
    this.show('shop', true);
    this.renderShop();
    this.tickWait();
  }
  closeShop() { this.show('shop', false); }
  shopError(e: string) { $('shopErr').textContent = e; }

  private tickWait() {
    const btn = $('spawnBase') as HTMLButtonElement;
    const left = Math.ceil((this.waitUntil - Date.now()) / 1000);
    if (left > 0) { btn.disabled = true; btn.textContent = `Renascer em ${left}s`; }
    else { btn.disabled = false; btn.textContent = 'Entrar em campo (Base)'; }
  }

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
    this.renderShop();
  }

  private renderShop() {
    const lvl = this.profile.level;
    for (const id of [...this.sel]) if (!this.available(ITEM_BY_ID[id])) this.sel.delete(id);
    for (const b of Array.from($('tabs').children) as HTMLElement[]) b.classList.toggle('on', b.dataset.cat === this.cat);
    // ---- cartões
    const root = $('items');
    const scroll = root.scrollTop;
    root.innerHTML = '';
    const cat = CATS.find((c) => c.id === this.cat) ?? CATS[0];
    const primary = [...this.sel].map((id) => ITEM_BY_ID[id]).find((i) => i.slot === 'primary');
    const grid = document.createElement('div'); grid.className = 'grid'; root.appendChild(grid);
    for (const it of ITEMS.filter(cat.match)) {
      const sniperLock = !!it.sight?.sniperOnly && (primary ?? ITEM_BY_ID.fuzil_basico).weapon?.cls !== 'sniper';
      const locked = !!it.soon || it.level > lvl;
      const price = priceFor(it, lvl);
      const tag = it.soon ? 'em breve' : it.level > lvl ? `nível ${it.level}` : price === 0 ? 'grátis' : money(price);
      const d = document.createElement('div');
      d.className = 'item' + (this.sel.has(it.id) ? ' sel' : '') + (locked ? ' locked' : '') + (sniperLock && !locked ? ' warn' : '');
      d.innerHTML = `${silhouette(it)}<div class="n"><span>${esc(it.name)}</span><em>${tag}</em></div>`
        + `<div class="d">${esc(it.desc)}${sniperLock && !locked ? ' <b>(exige arma de precisão)</b>' : ''}</div>${it.weapon ? `<div class="bars">${bars(it.weapon)}</div>` : ''}`;
      if (!locked) d.onclick = () => this.toggle(it);
      grid.appendChild(d);
    }
    root.scrollTop = scroll;

    // ---- carrinho
    const res = buildLoadout([...this.sel], lvl, Infinity);
    const slots = $('slots');
    const rows: { label: string; item: Item | undefined; free?: string }[] = [];
    if (res.ok) {
      const lo = res.loadout;
      const pick = (slot: string) => [...this.sel].map((id) => ITEM_BY_ID[id]).find((i) => i.slot === slot);
      rows.push({ label: 'Principal', item: pick('primary'), free: 'Fuzil básico (grátis)' });
      rows.push({ label: 'Secundária', item: pick('secondary'), free: 'Pistola padrão (grátis)' });
      rows.push({ label: 'Mira', item: lo.sight, free: 'Mira de ferro' });
      rows.push({ label: 'Blindagem', item: lo.armor });
      rows.push({ label: 'Capacete', item: lo.helmet });
      rows.push({ label: 'Colete', item: lo.vest });
      rows.push({ label: 'Mochila', item: lo.pack });
      for (let k = 0; k < MAX_TOOLS; k++) rows.push({ label: k === 0 ? 'Ferramentas' : '', item: lo.tools[k] });
    }
    slots.innerHTML = rows.map((r) => {
      const body = r.item
        ? `<span class="nm">${esc(r.item.name)}</span><span class="pr">${priceFor(r.item, lvl) === 0 ? 'grátis' : money(priceFor(r.item, lvl))}</span><button data-id="${r.item.id}" title="Remover">×</button>`
        : `<span class="nm empty">${r.free ? esc(r.free) : 'vazio'}</span>`;
      return `<div class="slot"><label>${r.label}</label>${body}</div>`;
    }).join('');
    for (const b of Array.from(slots.querySelectorAll('button')) as HTMLButtonElement[]) b.onclick = () => { this.sel.delete(b.dataset.id!); this.renderShop(); };
    if (res.ok) {
      const lo = res.loadout;
      this.onPreview({ armor: lo.armor?.armor ?? 0, helmet: lo.helmet?.helmet ?? 0, pack: lo.pack?.pack ?? 0, gun: lo.primary.idx });
    }
    const cost = res.ok ? res.loadout.cost : 0;
    $('totalV').textContent = money(cost);
    const after = this.profile.cash - cost;
    $('afterV').textContent = money(after);
    $('afterV').style.color = after < 0 ? '#ff7b7b' : '#7ee08a';
    $('shopErr').textContent = !res.ok ? res.error : after < 0 ? 'Saldo insuficiente — tire itens do carrinho.' : '';
    ($('repeatBtn') as HTMLButtonElement).disabled = !this.lastBuy.length;
    $('repeatBtn').title = this.lastBuy.length ? this.lastBuy.map((id) => ITEM_BY_ID[id].name).join(', ') : 'Nenhuma compra anterior';
    ($('spawnBase') as HTMLButtonElement).dataset.bad = !res.ok || after < 0 ? '1' : '';
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
  /** Desenha o mapa inteiro uma vez (terreno, estradas, construções) numa imagem que o minimapa só transforma. */
  setWorld(world: World) {
    const S = 375, px = WORLD_SIZE / S;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(S, S);
    const pal: Record<number, [number, number, number]> = {
      [Surface.Grass]: [112, 150, 78], [Surface.Road]: [170, 160, 140], [Surface.Field]: [176, 158, 82],
      [Surface.Dirt]: [158, 140, 104], [Surface.Forest]: [64, 106, 56], [Surface.Concrete]: [150, 150, 146],
    };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = (i + 0.5) * px, z = (j + 0.5) * px;
      const [r, g, b] = pal[world.surfaceAt(x, z)] ?? pal[Surface.Grass];
      const sh = Math.max(-0.28, Math.min(0.28, (world.heightAt(x + px, z) - world.heightAt(x - px, z)) * 0.035 + (world.heightAt(x, z + px) - world.heightAt(x, z - px)) * 0.02));
      const k = 1 + sh;
      const o = (j * S + i) * 4;
      img.data[o] = r * k; img.data[o + 1] = g * k; img.data[o + 2] = b * k; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    for (const b of world.boxes) {
      if (b.kind === BoxKind.Tree || b.kind === BoxKind.Rock || b.kind === BoxKind.Crate || b.kind === BoxKind.Sandbag || b.kind === BoxKind.Fob) continue;
      c.fillStyle = b.kind === BoxKind.Wall || b.kind === BoxKind.Fence ? '#5d5d58' : b.kind === BoxKind.Container ? '#6b4a3a' : b.kind === BoxKind.Roof ? '#3d3d3a' : '#46484c';
      c.fillRect(b.x0 / px, b.z0 / px, Math.max(1, (b.x1 - b.x0) / px), Math.max(1, (b.z1 - b.z0) / px));
    }
    this.mmBase = cv;
  }

  /** N: aumenta/diminui o zoom (Shift+N diminui) */
  cycleZoom(dir: 1 | -1 = 1) {
    const n = UI.MM_ZOOMS.length;
    this.mmZoomIdx = (this.mmZoomIdx + (dir === 1 ? 1 : n - 1)) % n;
    this.center(`Minimapa ${['mundo', 'regional', 'próximo', 'detalhe'][this.mmZoomIdx]} (N)`, 900);
  }

  minimap(px: number, pz: number, yaw: number, cz: Zone, hz: Zone, bases: { x: number; z: number }[], fobs: MapFob[], dots: MapDot[], myTeam: number) {
    const c = this.mm, S = 240, H = S / 2;
    const sc = UI.MM_ZOOMS[this.mmZoomIdx];
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    // mundo -> tela: o mapa gira com você, a frente é sempre para cima
    const X = (x: number, z: number) => H + sc * ((x - px) * cosY - (z - pz) * sinY);
    const Y = (x: number, z: number) => H + sc * ((x - px) * sinY + (z - pz) * cosY);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(H, H, H - 1, 0, 6.2832); c.clip();
    c.fillStyle = '#10161a'; c.fillRect(0, 0, S, S);
    if (this.mmBase) {
      c.save();
      c.translate(H, H); c.rotate(yaw); c.scale(sc, sc); c.translate(-px, -pz);
      c.imageSmoothingEnabled = sc < 1.2;
      c.drawImage(this.mmBase, 0, 0, WORLD_SIZE, WORLD_SIZE);
      c.restore();
    }
    // zonas
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.fillStyle = 'rgba(255,255,255,.10)';
    c.beginPath(); c.arc(X(cz.x, cz.z), Y(cz.x, cz.z), cz.r * sc, 0, 6.2832); c.fill(); c.stroke();
    c.strokeStyle = '#ff8a1f'; c.fillStyle = 'rgba(255,138,31,.38)';
    c.beginPath(); c.arc(X(hz.x, hz.z), Y(hz.x, hz.z), Math.max(4, hz.r * sc), 0, 6.2832); c.fill(); c.stroke();
    // bases
    bases.forEach((b, t) => {
      const x = X(b.x, b.z), y = Y(b.x, b.z);
      c.fillStyle = TEAM_CSS[t]; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.rect(x - 6, y - 6, 12, 12); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.fillText('B', x, y + 3.2);
    });
    // FOBs
    for (const f of fobs) {
      const x = X(f.x, f.z), y = Y(f.x, f.z);
      c.fillStyle = TEAM_CSS[f.team]; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y + 5); c.lineTo(x - 7, y + 5); c.closePath(); c.fill(); c.stroke();
    }
    // aliados e alvos marcados
    for (const d of dots) {
      const x = X(d.x, d.z), y = Y(d.x, d.z);
      if ((x - H) ** 2 + (y - H) ** 2 > (H + 6) ** 2) continue;
      c.fillStyle = d.kind === 1 ? '#ff3030' : d.kind === 2 ? '#ffe14d' : TEAM_CSS[d.team];
      c.strokeStyle = '#000'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, d.kind === 1 ? 4 : 3.2, 0, 6.2832); c.fill(); c.stroke();
    }
    // seta na borda apontando a Control Zone quando ela está fora do mapa visível
    const zx = X(cz.x, cz.z) - H, zy = Y(cz.x, cz.z) - H;
    const zd = Math.hypot(zx, zy);
    if (zd > H - 4 + cz.r * sc) {
      const a = Math.atan2(zy, zx);
      c.save(); c.translate(H + Math.cos(a) * (H - 12), H + Math.sin(a) * (H - 12)); c.rotate(a);
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, 7); c.lineTo(-3, 0); c.lineTo(-6, -7); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    // norte
    {
      // o norte do mundo (−Z) passa pela mesma transformação do resto do mapa
      const ax = X(px, pz - 1000) - H, ay = Y(px, pz - 1000) - H, al = Math.hypot(ax, ay) || 1;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(H + (ax / al) * (H - 11), H + (ay / al) * (H - 11), 8, 0, 6.2832); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 11px system-ui'; c.textAlign = 'center';
      c.fillText('N', H + (ax / al) * (H - 11), H + (ay / al) * (H - 11) + 4);
    }
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
    c.beginPath(); c.arc(H, H, H - 1, 0, 6.2832); c.stroke();
    // cone de visão e marcador do jogador (sempre no centro, apontando para cima)
    c.save(); c.translate(H, H);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 62);
    g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 62, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.strokeStyle = TEAM_CSS[myTeam]; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.stroke(); c.fill();
    c.restore();
    $('mmZoom').textContent = `${Math.round(S / sc)} m · N`;
  }
}

export { money, esc, levelFromXp };
