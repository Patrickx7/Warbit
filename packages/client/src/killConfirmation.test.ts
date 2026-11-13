import { expect, it } from 'vitest';
import { KillChain, KILL_CHAIN_WINDOW_MS } from './killConfirmation';

it('acumula abates rápidos e soma bônus sem contar outro abate', () => {
  const chain = new KillChain();
  chain.add('kill', 2000, 100, 0);
  chain.add('headshot', 300, 25, 1);
  chain.add('kill', 4000, 200, 4000);
  expect([chain.count, chain.cash, chain.xp]).toEqual([2, 6300, 325]);
});

it('recomeça depois do intervalo e ao morrer; bônus isolado não gera caveira', () => {
  const chain = new KillChain();
  expect(chain.add('headshot', 300, 25, 0)).toBe(false);
  chain.add('kill', 2000, 100, 0);
  chain.add('kill', 2000, 100, KILL_CHAIN_WINDOW_MS);
  expect([chain.count, chain.cash]).toEqual([1, 2000]);
  chain.reset();
  chain.add('kill', 2000, 100, KILL_CHAIN_WINDOW_MS + 100);
  expect([chain.count, chain.cash]).toEqual([1, 2000]);
});
