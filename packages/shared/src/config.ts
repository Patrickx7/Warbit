// Constantes de jogo do WarBit — tudo ajustável aqui.

export const TICK_RATE = 30; // simulação do servidor (Hz)
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // 1 snapshot a cada 2 ticks = 15 Hz
export const FAR_SNAPSHOT_EVERY = 4; // entidades longe: 1 a cada 4 snapshots
export const NEAR_DIST = 220; // metros: dentro disso, taxa cheia
export const MAX_PLAYERS = 60; // jogadores por partida (20 por time); bots completam as vagas
export const TEAM_COUNT = 3;
export const TEAM_NAMES = ['Azul', 'Vermelho', 'Verde'] as const;
export const TEAM_COLORS = [0x3b82f6, 0xef4444, 0x22c55e] as const;
export const TEAM_CSS = ['#3b82f6', '#ef4444', '#22c55e'] as const;

// Mundo
export const WORLD_SIZE = 1500;
export const BUSH_RADIUS_MIN = 1.0;
export const BUSH_RADIUS_MAX = 1.6;
export const BUSH_HEIGHT_MIN = 1.2;
export const BUSH_HEIGHT_MAX = 1.8;
export const CZ_RADIUS = 150; // Control Zone
export const HZ_RADIUS = 30; // Hot Zone
export const HZ_MOVE_SECONDS = 120;

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
export const PRONE_HEIGHT = 0.55;
export const PRONE_EYE_HEIGHT = 0.4;
export const WALK_SPEED = 3.6;
export const SPRINT_SPEED = 6.0;
export const CROUCH_SPEED = 1.8;
export const PRONE_SPEED = 0.85;
export const JUMP_SPEED = 5.6;
export const GRAVITY = 22;
export const STEP_HEIGHT = 0.6;
export const MAX_HP = 100;
export const STAMINA_DRAIN = 1 / 25; // fôlego: ~25 s de corrida
export const STAMINA_REGEN = 1 / 7;
export const STAMINA_RESUME = 0.3; // cansado: só volta a correr com 30%
export const SPRINT_FLAG_SPEED = 4.6;
export const RESPAWN_SECONDS = 0;
export const BOT_RESPAWN_SECONDS = 10;

// FOB (posição fortificada construída pelo time)
export const FOB_HP = 300;
export const FOB_RADIUS = 10; // raio de reabastecimento
export const FOB_MIN_BASE_DIST = 160;

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
