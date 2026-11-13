import { TEAM_CSS, TEAM_NAMES } from '@warbit/shared';

const icon = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const helmet = icon('<path d="M3 15a9 9 0 0 1 18 0v3H3z"/><path d="M2 18h20M17 9v5" fill="none" stroke="currentColor" stroke-width="2"/>');
const armor = icon('<path d="M7 2h3v3h4V2h3l4 6-3 3v11H6V11L3 8z"/><path d="M9 11h6v7H9z" fill="#000" opacity=".3"/>');
const heart = icon('<path d="M12 21 3 12C-3 5 6-1 12 6c6-7 15-1 9 6z"/>');
const insignia = [
  '<path d="m6 15 6-8 6 8M9 15l3-4 3 4"/>',
  '<path d="m6 9 6 4 6-4M6 14l6 4 6-4"/>',
  '<path d="m12 5 6 7-6 7-6-7zM9 12h6"/>',
];

export class ConditionHud {
  private healthBar: HTMLElement;
  private helmet: HTMLElement;
  private armor: HTMLElement;
  private health: HTMLElement;
  private team: HTMLElement;
  private teamId = -1;

  constructor(private root: HTMLElement) {
    root.innerHTML = `<div class="condition-track"><i></i></div><div class="condition-values">
      <span data-stat="helmet">${helmet}<b>—</b></span><span data-stat="armor">${armor}<b>—</b></span>
      <span data-stat="health">${heart}<b>100</b></span><span class="team-badge" role="img"></span></div>`;
    this.healthBar = root.querySelector('i')!;
    this.helmet = root.querySelector('[data-stat="helmet"]')!;
    this.armor = root.querySelector('[data-stat="armor"]')!;
    this.health = root.querySelector('[data-stat="health"]')!;
    this.team = root.querySelector('.team-badge')!;
  }

  update(hp: number, armor: number | null, helmet: number | null, team: number, visible: boolean) {
    this.root.classList.toggle('hidden', !visible);
    const value = (el: HTMLElement, n: number | null, label: string, percent = true) => {
      const amount = n === null ? null : Math.max(0, Math.min(100, Math.ceil(n)));
      el.querySelector('b')!.textContent = amount === null ? '—' : `${amount}${percent ? '%' : ''}`;
      el.classList.toggle('missing', amount === null);
      el.classList.toggle('worn', amount !== null && amount <= 50 && amount > 25);
      el.classList.toggle('critical', amount !== null && amount <= 25);
      el.title = amount === null ? `${label}: não equipado` : `${label}: ${amount}${percent ? '% de integridade' : ' de vida'}`;
      el.setAttribute('aria-label', el.title);
    };
    value(this.helmet, helmet, 'Capacete'); value(this.armor, armor, 'Armadura'); value(this.health, hp, 'Vida', false);
    this.healthBar.style.width = Math.max(0, Math.min(100, hp)) + '%';
    this.healthBar.classList.toggle('critical', hp <= 25);
    if (team !== this.teamId) {
      this.teamId = team;
      this.team.style.color = TEAM_CSS[team] ?? '#aaa';
      this.team.innerHTML = icon(`<circle cx="12" cy="12" r="11" fill="currentColor" opacity=".2"/><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${insignia[team] ?? ''}</g>`);
      this.team.setAttribute('aria-label', `Time ${TEAM_NAMES[team] ?? ''}`);
      this.team.title = `Time ${TEAM_NAMES[team] ?? ''}`;
    }
  }
}
