export const KILL_CHAIN_WINDOW_MS = 5000;

export class KillChain {
  count = 0;
  cash = 0;
  xp = 0;
  lastKill = -Infinity;
  add(kind: 'kill' | 'headshot', cash: number, xp: number, now: number): boolean {
    if (now - this.lastKill >= KILL_CHAIN_WINDOW_MS) this.reset();
    if (kind === 'kill') { this.count++; this.lastKill = now; }
    if (!this.count) return false;
    this.cash += cash; this.xp += xp;
    return true;
  }
  reset() { this.count = this.cash = this.xp = 0; this.lastKill = -Infinity; }
}

const skull = '<svg viewBox="0 0 24 28" aria-hidden="true"><path fill="currentColor" d="M12 1C5 1 2 5 2 11c0 4 2 6 5 8v6h10v-6c3-2 5-4 5-8C22 5 19 1 12 1Z"/><path fill="#202724" d="M5 10h5v5H6Zm9 0h5l-1 5h-4Zm-2 5-2 4h4Z"/><path stroke="#202724" stroke-width="1.2" d="M9 21v5m3-5v5m3-5v5"/></svg>';

export class KillConfirmation {
  readonly element = document.createElement('div');
  readonly chain = new KillChain();
  private timer = 0;
  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      .kill-confirmation {position:fixed;left:50%;top:calc(50% + 90px);transform:translateX(-50%);z-index:12;pointer-events:none;text-align:center;color:#f2f4e9;font-family:Arial,sans-serif;text-shadow:0 1px 3px #000;min-width:160px;max-width:280px;opacity:0;transition:opacity .25s}
      .kill-confirmation.active {opacity:1}
      .kill-confirmation .skulls {display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-bottom:5px}
      .kill-confirmation svg {width:18px;height:21px;filter:drop-shadow(0 1px 2px #000)}
      .kill-confirmation .payout {display:inline-block;padding:3px 12px;background:#121b17b3;border:1px solid #d1d5bc80;font-size:19px;font-weight:bold;font-variant-numeric:tabular-nums;letter-spacing:.5px}
      .kill-confirmation .details {margin-top:4px;font-size:10px;letter-spacing:1px}
      .kill-confirmation .payout.flash {animation:kill-cash-pop .2s ease-out}
      @keyframes kill-cash-pop {from{transform:scale(1.16);color:#e4d482}to{transform:scale(1);color:#f2f4e9}}
      @media(max-height:500px){.kill-confirmation{top:calc(50% + 55px)}}
      @media(prefers-reduced-motion:reduce){.kill-confirmation .payout.flash{animation:none}}
    `;
    document.head.append(style);
    this.element.className = 'kill-confirmation';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    document.body.append(this.element);
  }
  add(kind: 'kill' | 'headshot', cash: number, xp: number) {
    const now = performance.now();
    if (!this.chain.add(kind, cash, xp, now)) return;
    const n = this.chain.count;
    this.element.innerHTML = `<div class="skulls">${skull.repeat(n)}</div><div class="payout flash">+$${this.chain.cash.toLocaleString('pt-BR')}</div><div class="details">${n === 1 ? 'ABATE CONFIRMADO' : `${n} ABATES EM SEQUÊNCIA`} · +${this.chain.xp} XP</div>`;
    this.element.setAttribute('aria-label', `${n} abates. ${this.chain.cash} de dinheiro recebido. ${this.chain.xp} XP.`);
    this.element.classList.add('active');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.reset(), Math.max(0, KILL_CHAIN_WINDOW_MS - (now - this.chain.lastKill)));
  }
  reset() { clearTimeout(this.timer); this.chain.reset(); this.element.classList.remove('active'); }
}
