import { ITEM_BY_ID, type LootView } from '@warbit/shared';
import { weaponIcon } from './render/itemIcons';

export class LootPanel {
  readonly element = document.createElement('div');
  constructor(readonly swap: (body: LootView, slot: number) => void, readonly ammo: () => void, readonly close: () => void) {
    this.element.style.cssText = 'position:fixed;inset:20% 25%;z-index:100;background:#171d20ed;border:1px solid #8b8666;padding:24px;color:#eee;display:none';
    document.body.append(this.element);
  }
  get open() { return this.element.style.display !== 'none'; }
  hide() { this.element.style.display = 'none'; }
  show(body: LootView | null) {
    if (!body) { this.hide(); this.close(); return; }
    this.element.replaceChildren(); this.element.style.display = 'block';
    const title = document.createElement('h2'); title.textContent = `Corpo de ${body.name}`; this.element.append(title);
    body.weapons.forEach((id, slot) => {
      const item = ITEM_BY_ID[id], button = document.createElement('button');
      if (!item?.weapon) return;
      const icon = document.createElement('img'); icon.src = weaponIcon(id); icon.alt = item.name; icon.style.cssText = 'width:120px;height:60px;object-fit:contain;display:block';
      button.append(icon, document.createTextNode(`Trocar ${slot === 0 ? 'principal' : 'reserva'}: ${item.name} · ${body.ammo[slot]} balas`));
      button.onclick = () => this.swap(body, slot); this.element.append(button);
    });
    const mags = document.createElement('p'); mags.textContent = `${body.magazines.length} carregadores disponíveis. A sua arma e as balas carregadas ficam no corpo ao trocar.`; this.element.append(mags);
    const take = document.createElement('button'); take.textContent = 'Pegar carregadores compatíveis'; take.onclick = this.ammo;
    const exit = document.createElement('button'); exit.textContent = 'Fechar [Esc]'; exit.onclick = this.close; this.element.append(take, exit);
  }
}
