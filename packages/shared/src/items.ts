import { RECRUIT_DISCOUNT, RECRUIT_DISCOUNT_MAX_LEVEL } from './config';

export type Slot = 'primary' | 'secondary' | 'armor' | 'helmet' | 'vest' | 'tool' | 'sight' | 'pack' | 'suppressor' | 'secondarySuppressor';
export type SightKind = 'reddot' | 'holo' | 'scope';
export type Track = 'Miras' | 'Básico' | 'Assalto' | 'Infantaria' | 'Médica' | 'Construção' | 'Recon' | 'Suporte' | 'Veículos';
export type WeaponClass = 'pistol' | 'rifle' | 'smg' | 'shotgun' | 'sniper';
export type ToolKind = 'revive' | 'defib' | 'medbag' | 'frag' | 'build' | 'mark' | 'fob';

export interface WeaponStats {
  cls: WeaponClass;
  dmg: number;       // dano no corpo, de perto
  rpm: number;
  mag: number;
  reload: number;    // segundos
  spread: number;    // radianos, sem mirar
  adsSpread: number; // radianos, mirando
  auto: boolean;
  falloffStart: number; // m
  falloffEnd: number;   // m
  minDmgMul: number;
  headMul: number;
  pellets?: number;
  recoil: number;    // graus por tiro
  zoom: number;      // multiplicador de FOV ao mirar
}

export interface Item {
  id: string;
  idx: number;
  name: string;
  slot: Slot;
  track: Track;
  price: number;
  level: number;      // nível necessário
  desc: string;
  weapon?: WeaponStats;
  armor?: number;     // nível 1-4
  helmet?: number;    // nível 1-4
  mags?: number;      // carregadores extras (colete, mochila)
  pack?: number;      // tamanho da mochila (1 pequena, 2 média, 3 grande): muda o visual do soldado
  tool?: ToolKind;
  sight?: { zoom: number; kind: SightKind; sniperOnly?: boolean }; // zoom = multiplicador de FOV ao mirar (menor = mais aproximado)
  soon?: boolean;     // listado, mas ainda não disponível (Fase 2)
  empty?: boolean;    // espaço de arma vazio; não é item da loja
}

type Def = Omit<Item, 'idx'>;
const W = (cls: WeaponClass, dmg: number, rpm: number, mag: number, reload: number, spread: number, adsSpread: number, auto: boolean,
  falloffStart: number, falloffEnd: number, minDmgMul: number, headMul: number, recoil: number, zoom: number, pellets?: number): WeaponStats =>
  ({ cls, dmg, rpm, mag, reload, spread, adsSpread, auto, falloffStart, falloffEnd, minDmgMul, headMul, recoil, zoom, pellets });

const DEFS: Def[] = [
  { id:'silenciador', name:'Silenciador principal',slot:'suppressor',track:'Infantaria',price:700,level:1,desc:'Reduz som e clarão dos disparos da arma principal.' },
  { id:'silenciador_pistola', name:'Silenciador de pistola',slot:'secondarySuppressor',track:'Assalto',price:350,level:1,desc:'Reduz som e clarão da arma reserva.' },
  // --- kit básico gratuito ---
  { id: 'pistola', name: 'Pistola padrão', slot: 'secondary', track: 'Básico', price: 0, level: 1, desc: 'Grátis. Sempre disponível.', weapon: W('pistol', 22, 360, 12, 1.5, 0.022, 0.008, false, 15, 50, 0.5, 2.0, 1.4, 0.85) },
  { id: 'fuzil_basico', name: 'Fuzil básico', slot: 'primary', track: 'Básico', price: 0, level: 1, desc: 'Grátis. Semiautomático, fraco mas confiável.', weapon: W('rifle', 24, 300, 15, 2.4, 0.028, 0.006, false, 40, 140, 0.6, 1.8, 1.6, 0.7) },
  // --- pistolas ---
  { id: 'revolver', name: 'Revólver pesado', slot: 'secondary', track: 'Assalto', price: 300, level: 2, desc: 'Seis tiros que doem.', weapon: W('pistol', 48, 160, 6, 2.2, 0.02, 0.006, false, 20, 70, 0.55, 2.0, 4.0, 0.8) },
  // --- fuzis ---
  { id: 'fuzil_leve', name: 'Fuzil leve', slot: 'primary', track: 'Infantaria', price: 600, level: 1, desc: 'Automático de entrada.', weapon: W('rifle', 22, 640, 30, 2.3, 0.03, 0.007, true, 35, 130, 0.6, 1.8, 1.1, 0.7) },
  { id: 'fuzil_padrao', name: 'Fuzil padrão', slot: 'primary', track: 'Infantaria', price: 1600, level: 1, desc: 'O cavalo de batalha.', weapon: W('rifle', 27, 620, 30, 2.4, 0.028, 0.0055, true, 45, 160, 0.62, 1.8, 1.25, 0.68) },
  { id: 'fuzil_tatico', name: 'Fuzil tático', slot: 'primary', track: 'Infantaria', price: 2800, level: 4, desc: 'Preciso e controlável.', weapon: W('rifle', 28, 720, 30, 2.1, 0.024, 0.004, true, 55, 180, 0.66, 1.8, 0.95, 0.62) },
  { id: 'fuzil_batalha', name: 'Fuzil de batalha', slot: 'primary', track: 'Infantaria', price: 6000, level: 8, desc: 'Calibre pesado, três tiros matam.', weapon: W('rifle', 42, 480, 20, 2.7, 0.03, 0.004, true, 70, 220, 0.72, 1.8, 2.1, 0.6) },
  // --- SMG ---
  { id: 'smg_compacta', name: 'SMG compacta', slot: 'primary', track: 'Assalto', price: 900, level: 1, desc: 'Leve, rápida, curta distância.', weapon: W('smg', 19, 820, 30, 1.9, 0.034, 0.012, true, 14, 60, 0.45, 1.6, 0.8, 0.82) },
  { id: 'smg_padrao', name: 'SMG padrão', slot: 'primary', track: 'Assalto', price: 1500, level: 3, desc: 'Equilíbrio para o combate urbano.', weapon: W('smg', 22, 780, 30, 2.0, 0.03, 0.01, true, 18, 75, 0.5, 1.6, 0.75, 0.8) },
  { id: 'smg_pesada', name: 'SMG pesada', slot: 'primary', track: 'Assalto', price: 2600, level: 6, desc: 'Derruba rápido de perto.', weapon: W('smg', 27, 700, 25, 2.1, 0.03, 0.01, true, 18, 70, 0.5, 1.6, 1.0, 0.8) },
  // --- escopeta ---
  { id: 'escopeta', name: 'Escopeta pump', slot: 'primary', track: 'Assalto', price: 1200, level: 2, desc: '8 balins. Dona dos corredores.', weapon: W('shotgun', 14, 75, 6, 3.0, 0.075, 0.055, false, 8, 32, 0.25, 1.3, 5.0, 0.88, 8) },
  // --- precisão ---
  { id: 'carabina_scout', name: 'Carabina scout', slot: 'primary', track: 'Recon', price: 1100, level: 2, desc: 'Ferrolho leve com luneta 3x.', weapon: W('sniper', 62, 50, 5, 2.8, 0.06, 0.0012, false, 120, 400, 0.8, 2.2, 5.0, 0.3) },
  { id: 'rifle_semi', name: 'Rifle semiautomático', slot: 'primary', track: 'Recon', price: 2400, level: 4, desc: 'Atirador designado.', weapon: W('sniper', 46, 240, 10, 2.6, 0.045, 0.002, false, 100, 350, 0.78, 2.0, 2.8, 0.34) },
  { id: 'sniper_ferrolho', name: 'Sniper de ferrolho', slot: 'primary', track: 'Recon', price: 4500, level: 6, desc: 'Um tiro no peito quase mata.', weapon: W('sniper', 88, 42, 5, 3.2, 0.07, 0.0008, false, 180, 500, 0.85, 2.5, 6.5, 0.22) },
  { id: 'sniper_pesado', name: 'Sniper pesado', slot: 'primary', track: 'Recon', price: 6400, level: 9, desc: 'Fura blindagem média.', weapon: W('sniper', 104, 38, 5, 3.4, 0.075, 0.0007, false, 220, 550, 0.88, 2.5, 7.5, 0.2) },
  { id: 'antimaterial', name: 'Antimaterial', slot: 'primary', track: 'Recon', price: 8800, level: 12, desc: 'Um tiro. Qualquer blindagem.', weapon: W('sniper', 150, 28, 4, 4.0, 0.09, 0.0006, false, 300, 600, 0.9, 2.5, 10, 0.18) },
  // --- metralhadoras (Fase 2) ---
  { id: 'mtr_leve', name: 'Metralhadora leve', slot: 'primary', track: 'Suporte', price: 3200, level: 5, desc: 'Metralhadora leve de apoio.', weapon: W('rifle', 24, 700, 60, 4.8, 0.045, 0.009, true, 60, 190, 0.65, 1.8, 1.7, 0.72) },
  { id: 'mtr_media', name: 'Metralhadora média', slot: 'primary', track: 'Suporte', price: 4300, level: 8, desc: 'Metralhadora média de apoio.', weapon: W('rifle', 32, 580, 80, 5.8, 0.05, 0.01, true, 80, 240, 0.7, 1.8, 2.2, 0.72) },
  // --- miras (preços estimados: o WarDogs não publicou) ---
  { id: 'mira_pontovermelho', name: 'Mira ponto vermelho', slot: 'sight', track: 'Miras', price: 350, level: 1, desc: 'Ponto vermelho em janela aberta. Pequeno aumento.', sight: { zoom: 0.8, kind: 'reddot' } },
  { id: 'mira_holografica', name: 'Mira holográfica', slot: 'sight', track: 'Miras', price: 600, level: 2, desc: 'Retículo em anel, rápido de alinhar.', sight: { zoom: 0.76, kind: 'holo' } },
  { id: 'mira_1_5x', name: 'Óptica 1,5x', slot: 'sight', track: 'Miras', price: 350, level: 1, desc: 'Mira compacta de 1,5 aumentos, retículo circular amarelo e visão periférica livre.', sight: { zoom: 0.69, kind: 'scope' } },
  { id: 'mira_2x', name: 'Mira 2x', slot: 'sight', track: 'Miras', price: 500, level: 2, desc: 'Luneta curta de 2 aumentos, retículo vermelho e visão periférica livre.', sight: { zoom: 0.52, kind: 'scope' } },
  { id: 'mira_4x', name: 'Luneta 4x', slot: 'sight', track: 'Miras', price: 900, level: 4, desc: 'Luneta de 4 aumentos.', sight: { zoom: 0.27, kind: 'scope' } },
  { id: 'mira_6x', name: 'Luneta 6x', slot: 'sight', track: 'Miras', price: 1400, level: 6, desc: 'Só para armas de precisão.', sight: { zoom: 0.18, kind: 'scope', sniperOnly: true } },
  { id: 'mira_8x', name: 'Luneta 8x', slot: 'sight', track: 'Miras', price: 2000, level: 8, desc: 'Só para armas de precisão. Longuíssimo alcance.', sight: { zoom: 0.13, kind: 'scope', sniperOnly: true } },
  // --- mochilas (preços estimados): mais munição, e o soldado muda de visual ---
  { id: 'mochila_pequena', name: 'Mochila de assalto', slot: 'pack', track: 'Infantaria', price: 150, level: 1, desc: 'Pequena e discreta. 1 espaço vazio.', pack: 1, mags: 1 },
  { id: 'mochila_media', name: 'Mochila média', slot: 'pack', track: 'Infantaria', price: 400, level: 2, desc: 'Com saco de dormir e bolsos laterais. 3 espaços vazios.', pack: 2, mags: 3 },
  { id: 'mochila_grande', name: 'Mochila grande', slot: 'pack', track: 'Infantaria', price: 800, level: 4, desc: 'Mochila de patrulha com faixas de fixação. 5 espaços vazios.', pack: 3, mags: 5 },
  // --- coletes táticos (munição) ---
  { id: 'colete_p', name: 'Colete tático P', slot: 'vest', track: 'Infantaria', price: 100, level: 1, desc: '2 espaços vazios.', mags: 2 },
  { id: 'colete_m', name: 'Colete tático M', slot: 'vest', track: 'Infantaria', price: 250, level: 1, desc: '4 espaços vazios.', mags: 4 },
  { id: 'colete_g', name: 'Colete tático G', slot: 'vest', track: 'Infantaria', price: 400, level: 3, desc: '6 espaços vazios.', mags: 6 },
  // --- blindagem ---
  { id: 'blind_1', name: 'Blindagem nível 1', slot: 'armor', track: 'Infantaria', price: 400, level: 1, desc: '-15% de dano no corpo.', armor: 1 },
  { id: 'blind_2', name: 'Blindagem nível 2', slot: 'armor', track: 'Infantaria', price: 1000, level: 2, desc: '-25% de dano no corpo.', armor: 2 },
  { id: 'blind_3', name: 'Blindagem nível 3', slot: 'armor', track: 'Infantaria', price: 2500, level: 5, desc: '-35% de dano no corpo.', armor: 3 },
  { id: 'blind_4', name: 'Blindagem nível 4', slot: 'armor', track: 'Infantaria', price: 5000, level: 8, desc: '-45% de dano no corpo.', armor: 4 },
  // --- capacetes ---
  { id: 'capacete_1', name: 'Capacete nível 1', slot: 'helmet', track: 'Infantaria', price: 200, level: 1, desc: '-15% de dano na cabeça.', helmet: 1 },
  { id: 'capacete_2', name: 'Capacete nível 2', slot: 'helmet', track: 'Infantaria', price: 500, level: 2, desc: '-25% de dano na cabeça.', helmet: 2 },
  { id: 'capacete_3', name: 'Capacete nível 3', slot: 'helmet', track: 'Infantaria', price: 2000, level: 5, desc: '-35% de dano na cabeça.', helmet: 3 },
  { id: 'capacete_4', name: 'Capacete nível 4', slot: 'helmet', track: 'Infantaria', price: 4500, level: 8, desc: '-45% de dano na cabeça.', helmet: 4 },
  // --- médica ---
  { id: 'reanimador', name: 'Reanimador de campo', slot: 'tool', track: 'Médica', price: 425, level: 1, desc: '[E] revive aliado caído em 3 s.', tool: 'revive' },
  { id: 'bolsa_medica', name: 'Bolsa médica', slot: 'tool', track: 'Médica', price: 1800, level: 3, desc: '[H] cura você e aliados próximos. 4 usos.', tool: 'medbag' },
  { id: 'desfibrilador', name: 'Desfibrilador', slot: 'tool', track: 'Médica', price: 6000, level: 7, desc: '[E] revive em 1 s com vida cheia.', tool: 'defib' },
  // --- utilitários ---
  { id: 'granada', name: 'Granada de fragmentação', slot: 'tool', track: 'Assalto', price: 400, level: 1, desc: '[G] 2 granadas.', tool: 'frag' },
  { id: 'fumaca', name: 'Granada de fumaça', slot: 'tool', track: 'Assalto', price: 200, level: 1, desc: 'Em breve.', soon: true },
  { id: 'coquetel', name: 'Coquetel incendiário', slot: 'tool', track: 'Assalto', price: 340, level: 2, desc: 'Em breve.', soon: true },
  { id: 'detonador', name: 'Detonador remoto + carga', slot: 'tool', track: 'Assalto', price: 650, level: 4, desc: 'Em breve.', soon: true },
  { id: 'pe_de_cabra', name: 'Pé de cabra de arrombamento', slot: 'tool', track: 'Construção', price: 885, level: 3, desc: 'Em breve.', soon: true },
  // --- construção ---
  { id: 'ferramenta_obra', name: 'Ferramenta de obra', slot: 'tool', track: 'Construção', price: 1000, level: 2, desc: '[B] ergue sacos de areia. 5 usos.', tool: 'build' },
  { id: 'kit_fob', name: 'Kit de FOB', slot: 'tool', track: 'Construção', price: 2500, level: 3, desc: '[F] ergue uma posição fortificada: caixa de suprimentos (munição e cura) e sacos de areia. Uma por time.', tool: 'fob' },
  { id: 'kit_reparo', name: 'Kit de reparo', slot: 'tool', track: 'Construção', price: 600, level: 2, desc: 'Fase 2 (veículos).', soon: true },
  // --- recon ---
  { id: 'binoculo', name: 'Binóculo marcador', slot: 'tool', track: 'Recon', price: 500, level: 1, desc: '[Q] marca o inimigo na mira para o time.', tool: 'mark' },
  // --- fase 2 ---
  { id: 'caixa_municao', name: 'Caixa de munição', slot: 'tool', track: 'Suporte', price: 800, level: 3, desc: 'Fase 2.', soon: true },
  { id: 'jipe', name: 'Jipe de transporte', slot: 'tool', track: 'Veículos', price: 4000, level: 3, desc: 'Fase 2.', soon: true },
  { id: 'blindado', name: 'Blindado leve', slot: 'tool', track: 'Veículos', price: 22000, level: 10, desc: 'Fase 2.', soon: true },
  { id: 'tanque', name: 'Tanque', slot: 'tool', track: 'Veículos', price: 28000, level: 14, desc: 'Fase 2.', soon: true },
];

export const ITEMS: Item[] = DEFS.map((d, idx) => ({ ...d, idx }));
export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const EMPTY_WEAPON_INDEX = 255;
const EMPTY_PRIMARY: Item = { id:'sem_arma_principal',idx:EMPTY_WEAPON_INDEX,name:'Sem arma',slot:'primary',track:'Básico',price:0,level:0,desc:'',empty:true,weapon:W('rifle',0,1,0,1,0,0,false,0,0,0,0,0,1) };
const EMPTY_SECONDARY: Item = { ...EMPTY_PRIMARY,id:'sem_arma_reserva',slot:'secondary',weapon:{...EMPTY_PRIMARY.weapon!,cls:'pistol'} };

export const FREE_PRIMARY = 'fuzil_basico';
export const FREE_SECONDARY = 'pistola';
export const MAX_TOOLS = 3;
export const BASE_MAGS = 3;
export const ARMOR_REDUCTION = [0, 0.15, 0.25, 0.35, 0.45];
export const FRAG_COUNT = 2;
export const MEDBAG_USES = 4;
export const BUILD_USES = 5;

export function priceFor(item: Item, level: number): number {
  if (item.price === 0) return 0;
  return level <= RECRUIT_DISCOUNT_MAX_LEVEL ? Math.round(item.price * RECRUIT_DISCOUNT) : item.price;
}

export interface Loadout {
  primary: Item;
  secondary: Item;
  armor?: Item;
  helmet?: Item;
  vest?: Item;
  sight?: Item;
  suppressor?: Item;
  secondarySuppressor?: Item;
  pack?: Item;
  tools: Item[];
  cost: number;
}

export type LoadoutResult = { ok: true; loadout: Loadout } | { ok: false; error: string };

/** Valida uma lista de ids de itens e calcula o custo. Usado pelo servidor (autoridade) e pelo cliente (pré-visualização). */
export function buildLoadout(ids: string[], level: number, cash: number): LoadoutResult {
  let primary: Item | undefined, secondary: Item | undefined, armor: Item | undefined, helmet: Item | undefined, vest: Item | undefined, sight: Item | undefined, pack: Item | undefined, suppressor: Item | undefined, secondarySuppressor: Item | undefined;
  const tools: Item[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const it = ITEM_BY_ID[id];
    if (!it) return { ok: false, error: `Item desconhecido: ${id}` };
    if (seen.has(id)) continue;
    seen.add(id);
    if (it.soon) return { ok: false, error: `${it.name} ainda não está disponível` };
    if (it.level > level) return { ok: false, error: `${it.name} exige nível ${it.level}` };
    switch (it.slot) {
      case 'primary': if (primary) return { ok: false, error: 'Só uma arma principal' }; primary = it; break;
      case 'secondary': if (secondary) return { ok: false, error: 'Só uma arma secundária' }; secondary = it; break;
      case 'armor': if (armor) return { ok: false, error: 'Só uma blindagem' }; armor = it; break;
      case 'helmet': if (helmet) return { ok: false, error: 'Só um capacete' }; helmet = it; break;
      case 'vest': if (vest) return { ok: false, error: 'Só um colete' }; vest = it; break;
      case 'pack': if (pack) return { ok: false, error: 'Só uma mochila' }; pack = it; break;
      case 'suppressor': if(suppressor) return {ok:false,error:'Só um silenciador principal'}; suppressor=it; break;
      case 'secondarySuppressor': if(secondarySuppressor) return {ok:false,error:'Só um silenciador de pistola'}; secondarySuppressor=it; break;
      case 'sight': if (sight) return { ok: false, error: 'Só uma mira' }; sight = it; break;
      case 'tool': tools.push(it); break;
    }
  }
  if (tools.length > MAX_TOOLS) return { ok: false, error: `No máximo ${MAX_TOOLS} ferramentas` };
  if (tools.some((t) => t.tool === 'revive') && tools.some((t) => t.tool === 'defib')) return { ok: false, error: 'Reanimador e desfibrilador não combinam' };
  primary ??= EMPTY_PRIMARY;
  secondary ??= EMPTY_SECONDARY;
  if (sight?.sight?.sniperOnly && primary.weapon?.cls !== 'sniper') return { ok: false, error: `${sight.name} só serve em arma de precisão` };
  const all = [primary, secondary, armor, helmet, vest, sight, pack, suppressor, secondarySuppressor, ...tools].filter(Boolean) as Item[];
  const cost = all.reduce((s, it) => s + priceFor(it, level), 0);
  if (cost > cash) return { ok: false, error: 'Saldo insuficiente' };
  return { ok: true, loadout: { primary, secondary, armor, helmet, vest, sight, pack, suppressor, secondarySuppressor, tools, cost } };
}

/** Kits que os bots compram (jogadores montam o próprio na loja). */
export const PRESETS: { name: string; items: string[] }[] = [
  { name: 'Recruta (grátis)', items: ['fuzil_basico', 'pistola'] },
  { name: 'Infantaria', items: ['fuzil_padrao', 'pistola', 'blind_1', 'capacete_1', 'colete_m', 'reanimador', 'mochila_media'] },
  { name: 'Assalto', items: ['smg_compacta', 'pistola', 'blind_1', 'capacete_1', 'granada', 'reanimador', 'mochila_pequena'] },
  { name: 'Médico', items: ['fuzil_leve', 'pistola', 'blind_1', 'reanimador', 'bolsa_medica', 'mochila_grande'] },
  { name: 'Construtor', items: ['fuzil_leve', 'pistola', 'blind_1', 'ferramenta_obra', 'kit_fob', 'reanimador', 'mochila_media'] },
  { name: 'Recon', items: ['carabina_scout', 'pistola', 'binoculo', 'colete_p', 'reanimador', 'mochila_pequena'] },
];
