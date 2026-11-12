import { GRAVITY } from './config';
import type { World } from './world';

export interface Nade { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number; owner: number }

export const NADE_RADIUS = 7.5;
export const NADE_DAMAGE = 140;
export const NADE_FUSE = 2.6;
export const NADE_SPEED = 19;

/** Física simples da granada — igual no servidor e no cliente (visual). Retorna true quando explode. */
export function stepNade(n: Nade, world: World, dt: number): boolean {
  n.fuse -= dt;
  if (n.fuse <= 0) return true;
  n.vy -= GRAVITY * dt;
  const sp = Math.hypot(n.vx, n.vy, n.vz);
  if (sp > 0.01) {
    const step = sp * dt;
    const d = world.raycast(n.x, n.y, n.z, n.vx / sp, n.vy / sp, n.vz / sp, step + 0.15);
    if (d < step + 0.15) {
      // bateu em algo: quica
      const ground = world.heightAt(n.x, n.z);
      if (n.y - ground < 0.4 && n.vy < 0) {
        n.vy = -n.vy * 0.35; n.vx *= 0.6; n.vz *= 0.6;
        n.y = ground + 0.16;
        if (Math.abs(n.vy) < 1) n.vy = 0;
      } else {
        n.vx *= -0.35; n.vz *= -0.35; n.vy *= 0.5;
      }
      return false;
    }
    n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
  }
  const g = world.heightAt(n.x, n.z);
  if (n.y < g + 0.15) { n.y = g + 0.15; if (n.vy < 0) n.vy = 0; n.vx *= 0.8; n.vz *= 0.8; }
  return false;
}
