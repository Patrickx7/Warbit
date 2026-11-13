import { cargoCapacity, loadoutIds, MAGAZINE_PRICE, type Magazine } from '@warbit/shared';
import { weaponIcon } from './render/itemIcons';
import { gearIcon, magazineIcon } from './render/gearIcons';
import { ConditionHud } from './conditionHud';
import {
  BoxKind, ITEMS, ITEM_BY_ID, MAX_TOOLS, SCORE_PER_PRESENCE_SECOND, SCORE_TO_WIN, Surface, TEAM_CSS, TEAM_NAMES, WORLD_SIZE, buildLoadout,
  levelFromXp, priceFor, xpForLevel, VEHICLES, VEHICLE_BY_ID, type VehicleState, type Item, type RosterEntry, type World, type Zone, type ZoneWhere, type WeaponStats, type Loadout,
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
  { id: 'primary', label: 'Fuzil de assalto', match: (i) => i.weapon?.cls === 'rifle' && !i.id.startsWith('mtr_') },
  { id: 'smg', label: 'SMG', match: (i) => i.weapon?.cls === 'smg' },
  { id: 'shotgun', label: 'Espingarda', match: (i) => i.weapon?.cls === 'shotgun' },
  { id: 'lmg', label: 'ML', match: (i) => i.id.startsWith('mtr_') },
  { id: 'dmr', label: 'Fuzil de atirador', match: (i) => i.id === 'rifle_semi' },
  { id: 'sniper', label: 'Fuzil', match: (i) => i.weapon?.cls === 'sniper' && i.id !== 'rifle_semi' },
  { id: 'secondary', label: 'Arma secundária', match: (i) => i.slot === 'secondary' && !i.soon },
  { id: 'suppressor', label: 'Silenciadores', match: (i) => i.slot === 'suppressor' || i.slot === 'secondarySuppressor' },
  { id: 'sight', label: 'Miras', match: (i) => i.slot === 'sight' },
  { id: 'armor', label: 'Proteção', match: (i) => (i.slot === 'armor' || i.slot === 'helmet') && !i.soon },
  { id: 'vest', label: 'Coletes táticos', match: (i) => i.slot === 'vest' && !i.soon },
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
  if (it.weapon || it.slot === 'primary' || it.slot === 'secondary') return `<img class="sil weapon-icon" alt="${esc(it.name)}" src="${weaponIcon(it.id)}">`;

  if(it.slot==='suppressor'||it.slot==='secondarySuppressor')return '<svg class="sil" viewBox="0 0 80 30"><rect x="8" y="9" width="58" height="12" rx="4"/><path d="M18 10v10M26 10v10M34 10v10M42 10v10" stroke="#777"/></svg>';
  const body = it.sight ? sightSvg(it) : it.pack ? packSvg(it.pack) : '';
  if (!body) return gearIcon(it); // todo item tem ícone
  return `<svg viewBox="0 0 80 30" class="sil">${body}</svg>`;
}

function bars(w: WeaponStats): string {
  const bar = (label: string, v: number, bad = false) =>
    `<div class="bar"><span>${label}</span><i><b class="${bad ? 'bad' : ''}" style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i></div>`;
  return bar('Dano', (w.dmg * (w.pellets ?? 1) * 0.5) / 55) + bar('Cadência', w.rpm / 900) + bar('Alcance', w.falloffEnd / 600) + bar('Recuo', w.recoil / 9, true);
}

export class UI {
  conditionHud = new ConditionHud($('conditionHud'));
  profile: ProfileView = { cash: 0, xp: 0, level: 1, lifeProfit: 0, kills: 0, deaths: 0 };
  /** nada vem marcado: o jogador escolhe item por item */
  private sel = new Set<string>();
  private cat = 'primary';
  private merchant = false;
  private owned = new Set<string>();
  private cargo: (Magazine | null)[] = [];
  private pendingMags = new Map<number,string>();
  private accessoryWeapon = 'fuzil_basico';
  onBuyEquipment: (items:string[], magazines:{slot:number;weapon:string}[])=>void = ()=>{};
  onDiscardMagazine: (slot:number)=>void = ()=>{};
  onMoveMagazine: (from:number,to:number)=>void = ()=>{};

  private lastBuy: string[] = [];
  private lastMagazines: {slot:number;weapon:string}[] = [];
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
  onBuyVehicle: (vehicleType: string) => void = () => {};

  constructor() {
    try { this.lastBuy = (JSON.parse(localStorage.getItem('warbit.lastBuy') ?? '[]') as string[]).filter((id) => ITEM_BY_ID[id]); } catch { /* sem armazenamento */ }
    try { const saved=JSON.parse(localStorage.getItem('warbit.lastMagazines')??'[]');if(Array.isArray(saved))this.lastMagazines=saved.filter(m=>m&&Number.isInteger(m.slot)&&m.slot>=0&&m.slot<16&&!!ITEM_BY_ID[m.weapon]?.weapon).slice(0,16); } catch { /* sem armazenamento */ }
    $('spawnBase').onclick = () => {
      if (Date.now() < this.waitUntil) return;
      const items = [...this.sel];
      if (this.merchant) {
        const res = buildLoadout(items, this.profile.level, Infinity);
        if (res.ok && !res.loadout.primary.empty && !this.magsFor(res.loadout.primary.id)
          && !confirm(`Você vai comprar sem carregadores para a ${res.loadout.primary.name}. Comprar assim mesmo?`)) { this.section('ammo'); return; }
        this.onBuyEquipment(items,[...this.pendingMags].map(([slot,weapon])=>({slot,weapon})));
      }
      else this.onSpawn([]);
    };
    $('repeatBtn').onclick = () => {
      if (!this.merchant) return;
      this.sel = new Set(this.lastBuy.filter(id => this.available(ITEM_BY_ID[id])));
      this.pendingMags.clear();
      const result = buildLoadout([...this.sel], this.profile.level, Infinity);
      if (result.ok) for (const m of this.lastMagazines) {
        if (m.slot < cargoCapacity(result.loadout) && !this.cargo[m.slot] && [result.loadout.primary.id,result.loadout.secondary.id].includes(m.weapon)) this.pendingMags.set(m.slot,m.weapon);
      }
      this.renderShop();
    };
    $('clearBtn').onclick = () => { this.pendingMags.clear(); this.sel = new Set(this.owned); this.renderShop(); };
    $('closeVehShop').onclick = () => this.closeVehicleShop();
    for(const b of $('merchantSections').querySelectorAll<HTMLElement>('[data-section]')) b.onclick=()=>this.section(b.dataset.section!);
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
      // jogadores vivos · pontos · barrinha que cresce com a porcentagem até a vitória
      d.innerHTML = `<span class="cnt" style="color:${TEAM_CSS[t]}"><svg viewBox="0 0 10 12"><circle cx="5" cy="3" r="2.6"/><path d="M0 12c0-4 2-5.6 5-5.6s5 1.600 5 5.600z"/></svg><i>0</i></span><b>000</b><div class="track"><div class="bar2" style="background:${TEAM_CSS[t]}"></div></div>`;
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
      d.querySelector('b')!.textContent = String(Math.floor(s.scores[t])).padStart(3, '0');
      d.querySelector('.cnt i')!.textContent = String(s.counts?.[t] ?? 0);
      d.title = `${TEAM_NAMES[t]} · ${s.counts?.[t] ?? 0} na Control Zone`;
      d.classList.toggle('ctrl', s.control === t);
      d.classList.toggle('mine', t === myTeam);
    }
    const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    // barra do próximo ponto: enche na cor de quem domina até +1; troca de cor quando outro time assume; empate = cinza
    const fill = $('phaseFill'), main = $('phaseMain');
    $('phaseHz').textContent = s.phase === 'live' ? `HZ ${mmss(s.hzIn)}` : '';
    let width = 0, color = '#7d8a85';
    if (s.phase === 'warmup') main.textContent = `Aquecimento · começa em ${s.timeLeft}s`;
    else if (s.phase === 'end') main.textContent = `Fim — ${TEAM_NAMES[s.winner] ?? ''} venceu · nova em ${s.timeLeft}s`;
    else if (s.control >= 0) {
      const c = s.control, frac = ((s.scores[c] % 1) + 1) % 1;
      width = frac * 100; color = TEAM_CSS[c];
      main.textContent = `${TEAM_NAMES[c]} dominando · +${(s.presence[c] * SCORE_PER_PRESENCE_SECOND).toFixed(2)}/s · ${Math.floor(frac * 100)}%`;
    } else {
      const anyone = s.presence.some((v) => v > 0);
      width = anyone ? 100 : 0;
      main.textContent = anyone ? 'Empate na Control Zone' : 'Control Zone vazia';
    }
    // mesmo time e enchendo: anima; trocou de time, completou o ponto ou empatou: pula direto (sem "voltar" animado)
    const jump = s.control !== this.phaseCtrl || width < this.phaseW;
    if (jump) fill.style.transition = 'none';
    fill.style.background = color;
    fill.style.width = width + '%';
    if (jump) { void fill.offsetWidth; fill.style.transition = ''; }
    this.phaseCtrl = s.control; this.phaseW = width;
  }
  private phaseCtrl = -2; private phaseW = 0;

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
    $('vehShopCash').textContent = money(p.cash);
    if (!$('shop').classList.contains('hidden')) this.renderShop();
    if (!$('vehicleShop').classList.contains('hidden')) this.renderVehicleShop();
  }

  // ---------- Loja de Veículos ----------
  openVehicleShop() {
    $('vehShopCash').textContent = money(this.profile.cash);
    this.renderVehicleShop();
    this.show('vehicleShop', true);
  }

  closeVehicleShop() {
    this.show('vehicleShop', false);
  }

  isVehicleShopOpen(): boolean {
    return !$('vehicleShop').classList.contains('hidden');
  }

  renderVehicleShop() {
    const grid = $('vehGrid');
    grid.innerHTML = '';
    for (const v of VEHICLES) {
      const card = document.createElement('div');
      card.className = `vehCard ${v.soon ? 'soon' : ''}`;
      const canAfford = this.profile.cash >= v.price;
      const speedKmh = Math.round(v.topSpeed * 3.6);
      card.innerHTML = `
        <div class="vHeader">
          <div class="vName">${esc(v.name)}</div>
          <span class="vBadge ${v.soon ? 'soon' : 'avail'}">${v.soon ? 'Em Breve' : 'Disponível'}</span>
        </div>
        <div class="vDesc">${esc(v.description)}</div>
        <div class="vStats">
          <div><span>Velocidade máx.</span> <b>${speedKmh} km/h</b></div>
          <div><span>Blindagem</span> <b>${v.maxHp} HP</b></div>
          <div><span>Aceleração</span> <b>${v.accel >= 14 ? 'Alta' : 'Média'}</b></div>
          <div><span>Lotação</span> <b>${v.id === 'quad' ? '2 · piloto + garupa' : '2+'}</b></div>
        </div>
        <div class="vFooter">
          <div class="vPrice">${money(v.price)}</div>
          <button class="${v.soon ? '' : 'primary'}" ${v.soon || !canAfford ? 'disabled' : ''}>
            ${v.soon ? 'Em desenvolvimento' : canAfford ? 'Comprar e Pilotar' : 'Saldo insuficiente'}
          </button>
        </div>
      `;
      if (!v.soon && canAfford) {
        card.querySelector('button')!.onclick = () => {
          this.closeVehicleShop();
          this.onBuyVehicle(v.id);
        };
      }
      grid.appendChild(card);
    }
  }

  setVehicleHud(active: boolean, speedKmh = 0, hp = 200, maxHp = 200) {
    const el = $('vehHud');
    el.classList.toggle('hidden', !active);
    if (!active) return;
    $('vehSpeed').innerHTML = `<b>${Math.round(Math.abs(speedKmh))}</b> <small>km/h</small>`;
    const pct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
    const bar = $('vehHpBar').firstElementChild as HTMLElement;
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444';
    }
    $('vehHpText').textContent = `${Math.ceil(hp)} HP`;
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
    if (on) { const n = Math.max(0, Math.ceil(left)); $('downLeft').textContent = left < 0 || !Number.isFinite(left) ? 'Sem limite de tempo' : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
  }

  perf(text: string) { $('perf').textContent = text; }

  // ---------- loja ----------
  private available(it: Item | undefined): boolean {
    return !!it && !it.soon && it.level <= this.profile.level;
  }

  private section(section:string) {
    $('shop').classList.toggle('ammo-mode',section==='ammo');
    $('shop').classList.toggle('accessory-mode',section==='accessories');
    this.curSection=section;
    const groups:Record<string,string[]>={pack:['pack'],vest:['vest'],weapons:['primary','smg','shotgun','lmg','dmr','sniper'],secondary:['secondary'],specialist:['medic','recon'],gear:['armor'],tools:['medic','build','recon','util','soon'],ammo:[],accessories:this.accessoryWeapon==='pistola'||ITEM_BY_ID[this.accessoryWeapon]?.slot==='secondary'?['suppressor']:['sight','suppressor']};
    const cats=groups[section]??groups.weapons;
    for(const b of Array.from($('tabs').children) as HTMLElement[]) b.classList.toggle('hidden',!cats.includes(b.dataset.cat!));
    for(const b of $('merchantSections').querySelectorAll<HTMLElement>('[data-section]')) b.classList.toggle('on',b.dataset.section===section);
    if(cats.length)this.cat=cats[0];this.renderShop();
  }
  openMerchant(lo: Loadout | null, cargo: (Magazine|null)[]) {
    this.merchant=true; this.owned=new Set(lo ? loadoutIds(lo):[]);this.sel=new Set(this.owned);
    this.cargo=cargo;this.pendingMags.clear();this.waitUntil=0;
    $('shop').classList.remove('respawn-only');$('shopMsg').textContent='';
    this.show('shop',true);this.section('pack');this.renderShop();this.tickWait();
  }
  setCargo(cargo:(Magazine|null)[]) { this.cargo=cargo; }
  rememberPurchase(items: string[], cargo: (Magazine|null)[]) {
    this.lastBuy=items.filter(id=>!!ITEM_BY_ID[id]);
    this.lastMagazines=cargo.flatMap((m,slot)=>m?[{slot,weapon:m.weapon}]:[]);
    try { localStorage.setItem('warbit.lastBuy',JSON.stringify(this.lastBuy));localStorage.setItem('warbit.lastMagazines',JSON.stringify(this.lastMagazines)); } catch { /* sem armazenamento */ }
  }
  openShop(msg: string, waitSeconds = 0) {
    $('shop').classList.remove('ammo-mode', 'accessory-mode');
    $('magazineShelf').replaceChildren();
    this.merchant=false;$('shop').classList.add('respawn-only');this.pendingMags.clear();

    $('shopMsg').textContent = msg;
    $('shopErr').textContent = '';
    this.sel.clear(); // nunca vem nada marcado
    this.waitUntil = Date.now() + waitSeconds * 1000;
    this.show('shop', true);
    this.renderShop();
    this.tickWait();
  }
  inventory(lo: Loadout | null) {
    const card = (label: string, it?: Item) => `<div class="inventory-slot">${it ? silhouette(it) : '<div class="empty-outline"></div>'}<span>${esc(label)}</span><b>${it ? esc(it.name) : 'VAZIO'}</b></div>`;
    $('inventoryEquipment').innerHTML = card('ARMA PRIMÁRIA', lo?.primary.empty ? undefined : lo?.primary) + card('ARMA RESERVA', lo?.secondary.empty ? undefined : lo?.secondary)
      + card('ESPECIALISTA', lo?.tools[0]) + `<div class="inventory-gear">${card('CAPACETE',lo?.helmet)}${card('ARMADURA',lo?.armor)}${card('COLETE',lo?.vest)}</div>`;
    $('inventoryPack').innerHTML = card('MOCHILA',lo?.pack) + (lo ? this.cargoHtml(lo,false) : '') + `<div class="inventory-gear">${(lo?.tools ?? []).map(i => card('ITEM', i)).join('')}</div>`;
    this.bindCargo($('inventoryPack'),false);
    $('inventoryBalance').textContent = money(this.profile.cash);
  }
  private cargoHtml(lo:Loadout,shop:boolean) {
    return `<div class="cargo-label">BOLSOS / COLETE / MOCHILA · ${cargoCapacity(lo)} ESPAÇOS · BOTÃO DIREITO: DESCARTAR</div><div class="cargo-grid">${Array.from({length:cargoCapacity(lo)},(_,i)=>{
      const pending=shop?this.pendingMags.get(i):undefined;
      const m=pending?{weapon:pending,rounds:ITEM_BY_ID[pending].weapon!.mag}:this.cargo[i];
      const rounds=m?.rounds??0;
      return `<button class="cargo-slot ${pending?'pending':''}" data-cargo="${i}" draggable="${!!m}" title="${m?esc(ITEM_BY_ID[m.weapon]?.name ?? m.weapon):'Espaço vazio'}"><small>${i+1}</small>${m?`<i>▥</i><span>${esc(ITEM_BY_ID[m.weapon]?.name ?? m.weapon)}<br>${rounds} balas</span>`:'<i>+</i>'}</button>`;
    }).join('')}</div>`;
  }
  private bindCargo(root:HTMLElement,shop:boolean) {
    for(const el of root.querySelectorAll<HTMLElement>('[data-cargo]')) {
      const to=Number(el.dataset.cargo);
      el.ondragstart=e=>e.dataTransfer?.setData('text/plain','slot:'+to);
      el.ondragover=e=>e.preventDefault();
      el.ondrop=e=>{
        e.preventDefault();const data=e.dataTransfer?.getData('text/plain')??'';
        if(shop && data.startsWith('buy:') && !this.cargo[to] && !this.pendingMags.has(to)) {
          const weapon=data.slice(4);if(!ITEM_BY_ID[weapon]?.weapon)return;
          this.pendingMags.set(to,weapon);this.renderShop();
        } else if(data.startsWith('slot:')) {
          const from=Number(data.slice(5));
          if(shop){const weapon=this.pendingMags.get(from);if(weapon&&!this.cargo[to]&&!this.pendingMags.has(to)){this.pendingMags.delete(from);this.pendingMags.set(to,weapon);this.renderShop();}}
          else this.onMoveMagazine(from,to);
        }
      };
      if(!shop) el.oncontextmenu=e=>{e.preventDefault();this.onDiscardMagazine(to);};
      if(shop) el.onclick=()=>{this.pendingMags.delete(to);this.renderShop();};
    }
  }
  closeShop() { this.show('shop', false); }
  shopError(e: string) { $('shopErr').textContent = e; }

  private tickWait() {
    const btn = $('spawnBase') as HTMLButtonElement;
    const left = Math.ceil((this.waitUntil - Date.now()) / 1000);
    if (left > 0) { btn.disabled = true; btn.textContent = `Renascer em ${left}s`; }
    else { btn.disabled = this.merchant && btn.dataset.bad === '1'; btn.textContent = this.merchant ? 'Confirmar compra' : 'Entrar em campo (Base)'; }
  }

  private toggle(it: Item) {
    if (it.slot === 'tool' && ['revive','defib','mark'].includes(it.tool ?? '')) { for (const id of this.sel) if (['revive','defib','mark'].includes(ITEM_BY_ID[id].tool ?? '') && id !== it.id) this.sel.delete(id); }
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
    if (!this.merchant) {
      $('shop').classList.add('respawn-only');
      $('shop').classList.remove('ammo-mode', 'accessory-mode');
      for (const id of ['magazineShelf', 'items', 'slots', 'shopCargo', 'equipmentExtras']) $(id).replaceChildren();
      ($('spawnBase') as HTMLButtonElement).dataset.bad = '';
      return;
    }
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
    if (cat.id === 'sight' && (!primary || primary.empty)) grid.innerHTML = '<div class="hint">Escolha uma arma principal primeiro (passo 3): aqui aparecem só as miras que servem nela.</div>';
    for (const it of ITEMS.filter(cat.match)) {
      if (it.sight && (!primary || primary.empty || (it.sight.sniperOnly && primary.weapon?.cls !== 'sniper'))) continue;
      const sniperLock = !!it.sight?.sniperOnly && (primary ?? ITEM_BY_ID.fuzil_basico).weapon?.cls !== 'sniper';
      const locked = !!it.soon || it.level > lvl;
      const price = priceFor(it, lvl);
      const tag = it.soon ? 'em breve' : it.level > lvl ? `nível ${it.level}` : price === 0 ? 'grátis' : money(price);
      const d = document.createElement('div');
      d.className = 'item' + (this.sel.has(it.id) ? ' sel' : '') + (locked ? ' locked' : '') + (sniperLock && !locked ? ' warn' : '');
      d.innerHTML = `${silhouette(it)}<div class="n"><span>${esc(it.name)}</span><em>${tag}</em></div>`
        + `<div class="d">${esc(it.desc)}${sniperLock && !locked ? ' <b>(exige arma de precisão)</b>' : ''}</div>${it.weapon ? `<div class="bars">${bars(it.weapon)}</div>` : ''}`;
      if(this.cat==='suppressor' && it.slot !== (ITEM_BY_ID[this.accessoryWeapon]?.slot==='secondary'?'secondarySuppressor':'suppressor')) continue;
      if (!locked) d.onclick = () => {
        if(it.weapon){ if(!this.sel.has(it.id))this.toggle(it);this.accessoryWeapon=it.id;this.section('ammo'); }
        else this.toggle(it);
      };
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
      rows.push({ label: 'Principal', item: lo.primary.empty ? undefined : lo.primary });
      rows.push({ label: 'Arma reserva', item: lo.secondary.empty ? undefined : lo.secondary });
      rows.push({ label: 'Especialista', item: lo.tools.find(t=>['revive','defib','mark'].includes(t.tool ?? '')) });
    }
    slots.innerHTML = rows.map((r) => {
      const body = r.item
        ? `${silhouette(r.item)}<span class="nm">${esc(r.item.name)}</span><span class="pr">${priceFor(r.item, lvl) === 0 ? 'grátis' : money(priceFor(r.item, lvl))}</span><button data-id="${r.item.id}" title="Remover">×</button>`
        : `<span class="nm empty">${r.free ? esc(r.free) : 'vazio'}</span>`;
      return `<div class="slot" data-equipment="${r.label}"><label>${r.label}</label>${body}<small>${r.label === 'Especialista' ? 'BINÓCULOS · DESFIBRILADOR' : 'MUNIÇÃO · ACESSÓRIOS'}</small></div>`;
    }).join('');
    for(const [i,el] of Array.from(slots.children).entries()) (el as HTMLElement).onclick=(e)=>{if((e.target as HTMLElement).closest('button'))return;this.section(['weapons','secondary','specialist'][i]);};
    for (const b of Array.from(slots.querySelectorAll('button')) as HTMLButtonElement[]) b.onclick = () => { this.sel.delete(b.dataset.id!); this.renderShop(); };
    if (res.ok) {
      const lo = res.loadout;
      this.onPreview({ armor: lo.armor?.armor ?? 0, helmet: lo.helmet?.helmet ?? 0, pack: lo.pack?.pack ?? 0, gun: lo.primary.idx });
    }
    if(res.ok) {
      const lo=res.loadout;
      // trocou mochila/colete/arma: mantém os carregadores do carrinho que ainda servem e os reacomoda nos espaços livres
      // (antes tudo era apagado — escolher o colete tático sumia com a munição)
      {
        const cap=cargoCapacity(lo), guns=[lo.primary.id,lo.secondary.id];
        const keep=[...this.pendingMags.entries()].sort((a,b)=>a[0]-b[0]).map(([,w])=>w).filter(w=>guns.includes(w));
        this.pendingMags.clear();
        for(let i=0;i<cap&&keep.length;i++) if(!this.cargo[i]) this.pendingMags.set(i,keep.shift()!);
      }
      $('shopPackName').textContent=lo.pack?.name ?? 'SEM MOCHILA';
      $('shopCargo').innerHTML=this.cargoHtml(lo,true);
      const focused=[lo.primary,lo.secondary].find(w=>w.id===this.accessoryWeapon)??lo.primary;
      const weapons=($('shop').classList.contains('accessory-mode')?[focused]:[lo.primary,lo.secondary]).filter(w=>!w.empty);
      $('magazineShelf').innerHTML=weapons.map(w=>`<div class="ammo-product"><strong>${esc(w.name)}</strong><button draggable="true" data-mag="${w.id}" class="magazine">${magazineIcon()}<span>Carregador cheio · ${w.weapon!.mag} balas<br>${money(MAGAZINE_PRICE)}</span></button><small>Pronto para usar. Arraste para um espaço livre ou clique para adicionar.</small></div>`).join('');
      const freeSlots=Array.from({length:cargoCapacity(lo)},(_,i)=>i).filter(i=>!this.cargo[i]&&!this.pendingMags.has(i));
      if(!lo.primary.empty && freeSlots.length) {
        $('magazineShelf').insertAdjacentHTML('afterbegin',`<button id="fillMags" class="primary">Encher os ${freeSlots.length} espaços livres com carregadores de ${esc(lo.primary.name)} · ${money(freeSlots.length*MAGAZINE_PRICE)}</button>`);
        $('fillMags').onclick=()=>{for(const i of freeSlots)this.pendingMags.set(i,lo.primary.id);this.renderShop();};
      } else if(!lo.primary.empty && !cargoCapacity(lo)) $('magazineShelf').insertAdjacentHTML('afterbegin','<div class="hint">Sem espaço para carregadores: compre uma mochila ou um colete (passos 1 e 2).</div>');
      for(const el of $('magazineShelf').querySelectorAll<HTMLElement>('[data-mag]')) {
        const weapon=el.dataset.mag!;
        el.ondragstart=e=>e.dataTransfer?.setData('text/plain','buy:'+weapon);
        el.onclick=()=>{const i=Array.from({length:cargoCapacity(lo)},(_,i)=>i).find(i=>!this.cargo[i]&&!this.pendingMags.has(i));if(i!==undefined){this.pendingMags.set(i,weapon);this.renderShop();}else $('shopErr').textContent='Sem espaço livre para outro carregador.';};
      }
      this.bindCargo($('shopCargo'),true);
      $('equipmentExtras').innerHTML=[lo.helmet,lo.armor,lo.vest,lo.pack,lo.sight,lo.suppressor,lo.secondarySuppressor,...lo.tools.filter(t=>!['revive','defib','mark'].includes(t.tool ?? ''))].filter(Boolean).map(i=>`<button data-remove="${i!.id}">${esc(i!.name)} ×</button>`).join('');
      for(const b of $('equipmentExtras').querySelectorAll<HTMLElement>('[data-remove]')) b.onclick=()=>{this.sel.delete(b.dataset.remove!);this.renderShop();};
    }
    const cost = res.ok ? loadoutIds(res.loadout).filter(id=>!this.owned.has(id)).reduce((n,id)=>n+priceFor(ITEM_BY_ID[id],lvl),0)+this.pendingMags.size*MAGAZINE_PRICE : 0;
    $('totalV').textContent = money(cost);
    const after = this.profile.cash - cost;
    $('afterV').textContent = money(after);
    $('afterV').style.color = after < 0 ? '#ff7b7b' : '#7ee08a';
    $('shopErr').textContent = !res.ok ? res.error : after < 0 ? 'Saldo insuficiente — tire itens do carrinho.' : '';
    ($('repeatBtn') as HTMLButtonElement).disabled = !this.lastBuy.length;
    $('repeatBtn').title = this.lastBuy.length ? this.lastBuy.map((id) => ITEM_BY_ID[id].name).join(', ') : 'Nenhuma compra anterior';
    ($('spawnBase') as HTMLButtonElement).dataset.bad = !res.ok || after < 0 ? '1' : '';
    this.renderChecklist(res.ok ? res.loadout : null);
  }

  private curSection = 'pack';
  private static readonly STEPS: { id: string; label: string }[] = [
    { id: 'pack', label: '1 · Mochila' }, { id: 'vest', label: '2 · Colete' }, { id: 'weapons', label: '3 · Arma' }, { id: 'ammo', label: '4 · Munição' },
    { id: 'accessories', label: '5 · Mira' }, { id: 'gear', label: '6 · Proteção' }, { id: 'tools', label: '7 · Itens' },
  ];
  /** carregadores (já guardados + no carrinho) da arma */
  private magsFor(weaponId: string) {
    return this.cargo.filter((m) => m?.weapon === weaponId).length + [...this.pendingMags.values()].filter((w) => w === weaponId).length;
  }
  /** Painel "o que falta": mostra cada passo com ✓ / ⚠ e leva até ele com um clique; botão Próximo segue a ordem. */
  private renderChecklist(lo: Loadout | null) {
    const el = $('shopChecklist');
    if (!this.merchant || !lo) { el.replaceChildren(); for (const b of $('merchantSections').querySelectorAll('.next')) b.classList.remove('next'); return; }
    const cap = cargoCapacity(lo);
    const prim = lo.primary.empty ? null : lo.primary;
    const mags = prim ? this.magsFor(prim.id) : 0;
    const rows: { step: string; label: string; value: string; cls: string }[] = [
      { step: 'pack', label: 'Mochila', value: lo.pack ? `${lo.pack.name} · ${cap} espaços` : `nenhuma · ${cap} espaço${cap === 1 ? '' : 's'}`, cls: lo.pack ? 'ok' : 'warn' },
      { step: 'vest', label: 'Colete', value: lo.vest ? lo.vest.name : 'nenhum (opcional, mais espaço)', cls: lo.vest ? 'ok' : '' },
      { step: 'weapons', label: 'Arma', value: prim ? prim.name : 'escolha uma arma', cls: prim ? 'ok' : 'bad' },
      { step: 'ammo', label: 'Munição', value: !prim ? '—' : mags ? `${mags} carregador${mags > 1 ? 'es' : ''}` : 'SEM MUNIÇÃO', cls: !prim ? '' : mags ? 'ok' : 'bad' },
      { step: 'accessories', label: 'Mira', value: lo.sight ? lo.sight.name : 'mira de ferro (opcional)', cls: lo.sight ? 'ok' : '' },
      { step: 'gear', label: 'Proteção', value: [lo.helmet?.name, lo.armor?.name].filter(Boolean).join(' + ') || 'nenhuma (opcional)', cls: lo.helmet || lo.armor ? 'ok' : '' },
    ];
    const steps = UI.STEPS, idx = steps.findIndex((s) => s.id === this.curSection);
    // próximo passo sugerido: o que é obrigatório e falta (arma, munição) vem antes da ordem normal
    const want = !prim && !['weapons', 'pack', 'vest'].includes(this.curSection) ? 'weapons'
      : prim && !mags && this.curSection !== 'ammo' ? 'ammo' : null;
    const next = want ? steps.find((s) => s.id === want)! : idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
    // a aba do próximo passo pisca
    for (const b of $('merchantSections').querySelectorAll<HTMLElement>('[data-section]')) b.classList.toggle('next', b.dataset.section === next?.id);
    const hint = !prim ? 'Comece pela mochila e pelo colete (dão espaço para munição) e depois escolha a arma.'
      : !mags ? 'Sua arma está sem munição! Vá em 4 · Munição e encha os espaços.' : 'Tudo pronto. Confira e clique em Confirmar compra.';
    el.innerHTML = rows.map((r) => `<div class="ck ${r.cls}" data-step="${r.step}"><span>${r.label}</span><b>${esc(r.value)}</b></div>`).join('')
      + `<div class="hint">${hint}</div>` + (next ? `<button id="shopNext">Próximo: ${next.label} ›</button>` : '');
    for (const c of el.querySelectorAll<HTMLElement>('[data-step]')) c.onclick = () => this.section(c.dataset.step!);
    if (next) $('shopNext').onclick = () => this.section(next.id);
  }

  /** Sair do comerciante: avisa se a compra não foi confirmada ou se a arma ficou sem munição. */
  canLeave(): boolean {
    if (!this.merchant || $('shop').classList.contains('hidden')) return true;
    const changed = this.pendingMags.size > 0 || this.sel.size !== this.owned.size || [...this.sel].some((id) => !this.owned.has(id));
    if (changed) return confirm('Você ainda não confirmou a compra. Sair e descartar o carrinho?');
    const prim = [...this.owned].map((id) => ITEM_BY_ID[id]).find((i) => i?.slot === 'primary');
    if (prim && !this.cargo.some((m) => m?.weapon === prim.id)) return confirm(`Sua ${prim.name} está sem carregadores de reserva. Sair mesmo assim?`);
    return true;
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

  minimap(px: number, pz: number, yaw: number, cz: Zone, hz: Zone, bases: { x: number; z: number }[], fobs: MapFob[], dots: MapDot[], myTeam: number, vehicles?: VehicleState[]) {
    const c = this.mm, S = 240, H = S / 2;
    const sc = UI.MM_ZOOMS[this.mmZoomIdx];
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    // mundo -> tela: o mapa gira com você, a frente é sempre para cima
    const X = (x: number, z: number) => H + sc * ((x - px) * cosY - (z - pz) * sinY);
    const Y = (x: number, z: number) => H + sc * ((x - px) * sinY + (z - pz) * cosY);
    c.clearRect(0, 0, S, S);
    c.save();
    // minimapa quadrado; circular é só a zona
    c.fillStyle = '#0c1410'; c.fillRect(0, 0, S, S);
    if (this.mmBase) {
      c.save();
      c.translate(H, H); c.rotate(yaw); c.scale(sc, sc); c.translate(-px, -pz);
      c.imageSmoothingEnabled = sc < 1.2;
      // desenha só o trecho visível (raio cobre a diagonal do quadrado): bem mais leve que girar o mapa inteiro a cada quadro
      const half = (H * 1.45) / sc, k = this.mmBase.width / WORLD_SIZE;
      const x0 = Math.max(0, px - half), x1 = Math.min(WORLD_SIZE, px + half), z0 = Math.max(0, pz - half), z1 = Math.min(WORLD_SIZE, pz + half);
      if (x1 > x0 && z1 > z0) c.drawImage(this.mmBase, x0 * k, z0 * k, (x1 - x0) * k, (z1 - z0) * k, x0, z0, x1 - x0, z1 - z0);
      c.restore();
    }
    // película verde-escura de mapa tático; fora da Control Zone fica mais escuro, então o círculo da zona se destaca
    c.fillStyle = 'rgba(10,52,36,.46)'; c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(2,10,7,.45)';
    c.beginPath(); c.rect(0, 0, S, S); c.arc(X(cz.x, cz.z), Y(cz.x, cz.z), cz.r * sc, 0, 6.2832); c.fill('evenodd');
    // zonas
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(214,240,226,.75)'; c.fillStyle = 'rgba(190,235,210,.07)';
    c.beginPath(); c.arc(X(cz.x, cz.z), Y(cz.x, cz.z), cz.r * sc, 0, 6.2832); c.fill(); c.stroke();
    c.lineWidth = 2;
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
      if (Math.abs(x - H) > H + 6 || Math.abs(y - H) > H + 6) continue;
      c.fillStyle = d.kind === 1 ? '#ff3030' : d.kind === 2 ? '#ffe14d' : TEAM_CSS[d.team];
      c.strokeStyle = '#000'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, d.kind === 1 ? 4 : 3.2, 0, 6.2832); c.fill(); c.stroke();
    }
    // veículos no minimapa
    if (vehicles) {
      for (const v of vehicles) {
        const x = X(v.x, v.z), y = Y(v.x, v.z);
        if (Math.abs(x - H) > H + 6 || Math.abs(y - H) > H + 6) continue;
        c.fillStyle = v.driverId !== -1 ? '#f5c542' : '#ffffff';
        c.strokeStyle = '#000'; c.lineWidth = 1;
        c.beginPath(); c.rect(x - 3, y - 3, 6, 6); c.fill(); c.stroke();
      }
    }
    // seta na borda apontando a Control Zone quando ela está fora do mapa visível
    const zx = X(cz.x, cz.z) - H, zy = Y(cz.x, cz.z) - H;
    if (Math.max(Math.abs(zx), Math.abs(zy)) > H - 4 + cz.r * sc) {
      const a = Math.atan2(zy, zx);
      const ek = (H - 12) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); // encosta na borda do quadrado
      c.save(); c.translate(H + Math.cos(a) * ek, H + Math.sin(a) * ek); c.rotate(a);
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, 7); c.lineTo(-3, 0); c.lineTo(-6, -7); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    // norte
    {
      // o norte do mundo (−Z) passa pela mesma transformação do resto do mapa
      const ax = X(px, pz - 1000) - H, ay = Y(px, pz - 1000) - H, al = Math.hypot(ax, ay) || 1;
      const nk = (H - 11) / Math.max(Math.abs(ax / al), Math.abs(ay / al));
      const nx = H + (ax / al) * nk, ny = H + (ay / al) * nk;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(nx, ny, 8, 0, 6.2832); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 11px system-ui'; c.textAlign = 'center';
      c.fillText('N', nx, ny + 4);
    }
    c.restore();
    c.strokeStyle = 'rgba(200,230,215,.4)'; c.lineWidth = 2;
    c.strokeRect(1, 1, S - 2, S - 2);
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
