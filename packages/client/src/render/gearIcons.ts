import type { Item } from '@warbit/shared';

// Ícones em SVG para todo item que não é arma (armas usam a foto do próprio modelo 3D, em itemIcons.ts).
// A cor base vem do CSS (.sil { fill }); detalhes usam opacidade ou uma cor de destaque.
// Para adicionar um item novo: crie uma entrada em BY_ID (pelo id do item) ou deixe cair no padrão do slot.

const RED = '#e2504a', AMBER = '#f0b23a', DK = 'opacity=".45"';
const wrap = (body: string) => `<svg class="sil" viewBox="0 0 80 40">${body}</svg>`;
const bars = (n: number, x: number, y: number) => Array.from({ length: n }, (_, i) => `<rect x="${x + i * 5}" y="${y}" width="3" height="6" fill="${AMBER}"/>`).join('');

const plate = (lvl: number) =>
  `<path d="M26 6h8l3 4h6l3-4h8l4 8-5 4v16H27V18l-5-4z"/><rect x="31" y="20" width="18" height="10" rx="1" ${DK}/>${bars(lvl, 40 - lvl * 2.5, 22)}`;
const helmet = (lvl: number) =>
  `<path d="M22 26c0-12 8-20 18-20s18 8 18 20v3H22z"/><rect x="20" y="27" width="40" height="4" rx="2" ${DK}/><rect x="54" y="18" width="7" height="12" rx="3" ${DK}/>${bars(lvl, 40 - lvl * 2.5, 15)}`;
const rig = (pouches: number) =>
  `<path d="M24 6h7l4 6h10l4-6h7v10H24z"/><rect x="22" y="16" width="36" height="5" ${DK}/>${Array.from({ length: pouches }, (_, i) => {
    const w = 32 / pouches;
    return `<rect x="${24 + i * w + 0.6}" y="21" width="${w - 1.2}" height="13" rx="1.5"/>`;
  }).join('')}`;

const BY_ID: Record<string, string> = {
  // médico
  reanimador: `<rect x="14" y="17" width="34" height="7" rx="2"/><rect x="48" y="19" width="12" height="3"/><rect x="60" y="20" width="10" height="1.4"/><rect x="8" y="14" width="6" height="13" rx="1"/><rect x="22" y="18.5" width="18" height="4" fill="${RED}"/>`,
  bolsa_medica: `<rect x="20" y="12" width="40" height="24" rx="4"/><path d="M32 12V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4h-4V9H36v3z"/><path d="M37 17h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="${RED}"/>`,
  desfibrilador: `<rect x="10" y="10" width="22" height="24" rx="4"/><rect x="48" y="10" width="22" height="24" rx="4"/><path d="M32 22h5l2-6 3 12 2-6h4" fill="none" stroke="${AMBER}" stroke-width="2"/><path d="M23 14l-6 9h5l-2 8 7-10h-5z" fill="${AMBER}"/><path d="M61 14l-6 9h5l-2 8 7-10h-5z" fill="${AMBER}"/>`,
  // utilitários
  granada: `<ellipse cx="40" cy="25" rx="11" ry="12"/><rect x="35" y="8" width="10" height="7" rx="1"/><path d="M45 9h9l-2 14h-3z" ${DK}/><circle cx="30" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M30 20h20M30 26h20M36 14v22M44 14v22" stroke="#000" stroke-opacity=".3" fill="none"/>`,
  fumaca: `<rect x="31" y="12" width="18" height="24" rx="3"/><rect x="34" y="7" width="12" height="6" rx="1"/><rect x="31" y="19" width="18" height="4" fill="${AMBER}"/><circle cx="58" cy="10" r="5" ${DK}/><circle cx="65" cy="16" r="4" ${DK}/><circle cx="54" cy="18" r="3" ${DK}/>`,
  coquetel: `<path d="M34 16c0-3 3-3 3-6V7h6v3c0 3 3 3 3 6v18a2 2 0 0 1-2 2H36a2 2 0 0 1-2-2z"/><rect x="34" y="22" width="12" height="8" ${DK}/><path d="M40 0c4 3 4 5 2 7h-4c-2-2-1-5 2-7z" fill="${AMBER}"/>`,
  detonador: `<rect x="14" y="14" width="22" height="20" rx="2"/><rect x="22" y="4" width="2" height="10"/><circle cx="25" cy="24" r="4" fill="${RED}"/><rect x="46" y="18" width="22" height="16" rx="2"/><path d="M36 26h10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M50 22h14M50 26h14M50 30h14" stroke="#000" stroke-opacity=".3" fill="none"/>`,
  pe_de_cabra: `<path d="M12 30L58 9c5-2 9 1 10 5l-4 1c-1-2-3-3-5-2L14 34z"/><path d="M12 30l-3 5 5-1z"/>`,
  // construção
  ferramenta_obra: `<rect x="38.5" y="3" width="3" height="22"/><rect x="34" y="2" width="12" height="3" rx="1"/><path d="M32 24h16v6c0 5-4 9-8 9s-8-4-8-9z"/>`,
  kit_fob: `<rect x="14" y="18" width="34" height="18" rx="1"/><path d="M14 24h34M26 18v18M36 18v18" stroke="#000" stroke-opacity=".3" fill="none"/><rect x="56" y="4" width="2" height="32"/><path d="M58 5h13l-4 5 4 5H58z" fill="${AMBER}"/>`,
  kit_reparo: `<path d="M20 30L44 12a8 8 0 0 1 11-9l-6 6 3 4 7-5a8 8 0 0 1-11 10L24 35a3.5 3.5 0 0 1-4-5z"/>`,
  // recon
  binoculo: `<rect x="16" y="9" width="18" height="24" rx="6"/><rect x="46" y="9" width="18" height="24" rx="6"/><rect x="32" y="15" width="16" height="8"/><circle cx="25" cy="27" r="5" ${DK}/><circle cx="55" cy="27" r="5" ${DK}/>`,
  // fase 2
  caixa_municao: `<rect x="16" y="14" width="48" height="22" rx="2"/><rect x="16" y="14" width="48" height="5" ${DK}/><path d="M32 14v-4h16v4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M26 24v8M32 24v8M38 24v8M44 24v8M50 24v8" stroke="${AMBER}" stroke-width="2.4" fill="none"/>`,
  jipe: `<path d="M10 24l4-10h26l8 8h16l4 6v4H10z"/><path d="M18 16h10v6H16z" ${DK}/><circle cx="24" cy="32" r="6"/><circle cx="56" cy="32" r="6"/><circle cx="24" cy="32" r="2.4" ${DK}/><circle cx="56" cy="32" r="2.4" ${DK}/>`,
  blindado: `<path d="M8 20l8-9h36l12 7 8 4v9H8z"/><rect x="30" y="5" width="16" height="6" rx="1"/><rect x="46" y="7" width="18" height="2"/><circle cx="20" cy="33" r="5"/><circle cx="34" cy="33" r="5"/><circle cx="48" cy="33" r="5"/><circle cx="62" cy="33" r="5"/>`,
  tanque: `<path d="M6 24h68l-4 12H10z"/><rect x="12" y="18" width="50" height="6" rx="2"/><rect x="24" y="8" width="24" height="10" rx="3"/><rect x="48" y="11" width="28" height="3"/><path d="M14 30h52" stroke="#000" stroke-opacity=".35" stroke-width="3" stroke-dasharray="4 3" fill="none"/>`,
};

/** ícone de qualquer item que não seja arma; sempre devolve algo (nunca vazio) */
export function gearIcon(it: Item): string {
  if (BY_ID[it.id]) return wrap(BY_ID[it.id]);
  if (it.armor) return wrap(plate(it.armor));
  if (it.helmet) return wrap(helmet(it.helmet));
  if (it.slot === 'vest') return wrap(rig(Math.max(2, Math.min(6, it.mags ?? 3))));
  // padrão: caixa de equipamento
  return wrap('<rect x="22" y="10" width="36" height="24" rx="3"/><rect x="22" y="18" width="36" height="3" opacity=".45"/><rect x="36" y="16" width="8" height="7" rx="1" opacity=".45"/>');
}

/** carregador (prateleira de munição) */
export function magazineIcon(): string {
  return `<svg class="sil mag" viewBox="0 0 40 40"><path d="M13 4h14l2 26-3 6H15l-3-6z"/><path d="M15 10h10M15 15h10M15 20h10" stroke="#000" stroke-opacity=".3" fill="none"/><rect x="15" y="4" width="10" height="3" fill="${AMBER}"/></svg>`;
}
