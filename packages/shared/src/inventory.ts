import { type Loadout, ITEM_BY_ID } from './items';
import type { World } from './world';
export interface Magazine { weapon: string; rounds: number }
export const MAGAZINE_PRICE = 35;
export function cargoCapacity(lo: Loadout): number { return 2 + (lo.vest?.mags ?? 0) + (lo.pack?.mags ?? 0); }
export function loadoutIds(lo: Loadout): string[] { return [lo.primary,lo.secondary,lo.armor,lo.helmet,lo.vest,lo.sight,lo.pack,lo.suppressor,lo.secondarySuppressor,...lo.tools].filter(i=>i&&!i.empty).map(i=>i!.id); }
export function validMagazine(m: Magazine): boolean { const w=ITEM_BY_ID[m?.weapon]?.weapon; return !!w && Number.isInteger(m.rounds) && m.rounds >= 0 && m.rounds <= w.mag; }
export function getEquipmentVendorPos(team: number, world: World) { const b=world.bases[team]; const x=b.x-8,z=b.z-4; return {x,z,y:world.heightAt(x,z),yaw:Math.PI/2}; }
