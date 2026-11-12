// Constantes de jogo do WarBit — tudo ajustável aqui.

export const TICK_RATE = 30; // simulação do servidor (Hz)
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // 1 snapshot a cada 2 ticks = 15 Hz
export const FAR_SNAPSHOT_EVERY = 4; // entidades longe: 1 a cada 4 snapshots
export const NEAR_DIST = 220; // metros: dentro disso, taxa cheia
export const MAX_PLAYERS = 100;
export const TEAM_COUNT = 3;
export const TEAM_NAMES = ['Azul', 'Vermelho', 'Verde'] as const;
export const TEAM_COLORS = [0x3b82f6, 0xef4444, 0x22c55e] as const;
export const TEAM_CSS = ['#3b82f6', '#ef4444', '#22c55e'] as const;

// Mundo
export const WORLD_SIZE = 1500;
export const CZ_RADIUS = 150; // Control Zone
export const HZ_RADIUS = 30; // Hot Zone
export const HZ_MOVE_SECONDS = 120;
export const FORWARD_SPAWN_DIST = 160; // distância do acampamento avançado até a borda da CZ

// Pontuação
export const SCORE_TO_WIN = 100;
export const SCORE_PER_PRESENCE_SECOND = 0.006; // pontos por (presença × segundo) do time que controla
export const HOT_ZONE_WEIGHT = 2; // jogador na hot zone conta em dobro
export const WARMUP_SECONDS = 15;
export const MATCH_END_SECONDS = 15;

// Jogador
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.25;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE_HEIGHT = 1.05;
export const WALK_SPEED = 5.2;
export const SPRINT_SPEED = 7.8;
export const CROUCH_SPEED = 2.6;
export const JUMP_SPEED = 7.2;
export const GRAVITY = 22;
export const STEP_HEIGHT = 0.6;
export const MAX_HP = 100;

// Vida / morte
export const DOWNED_SECONDS = 20; // tempo caído esperando médico
export const REVIVE_RANGE = 2.6;
export const REVIVE_SECONDS = 3; // reanimador de campo
export const DEFIB_SECONDS = 1; // desfibrilador
export const HP_REGEN_DELAY = 8; // s sem dano para começar a regenerar
export const HP_REGEN_RATE = 6; // hp/s (até 60)
export const HP_REGEN_CAP = 60;

// Economia
export const START_CASH = 10000;
export const RECRUIT_DISCOUNT_MAX_LEVEL = 10;
export const RECRUIT_DISCOUNT = 0.5;
export const PRESENCE_REWARD_SECONDS = 10;
export const BOT_START_CASH = 6000;

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 250));
}
export function xpForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  return n * n * 250;
}
