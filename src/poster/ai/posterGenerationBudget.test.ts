import { afterEach, expect, it, vi } from 'vitest';
import { createPosterGenerationBudget } from './posterGenerationBudget';

afterEach(() => vi.useRealTimers());

it('shares one deadline and allows only two requests', async () => {
  vi.useFakeTimers();
  const budget = createPosterGenerationBudget(120000);
  const call = vi.fn(async () => 'done');
  await budget.request(call);
  await vi.advanceTimersByTimeAsync(80000);
  await budget.request(call);
  expect(call.mock.calls).toHaveLength(2);
  expect(call).toHaveBeenLastCalledWith(40000, budget.signal);
  await expect(budget.request(call)).rejects.toThrow('two automatic AI passes');
  expect(call).toHaveBeenCalledTimes(2);
  budget.dispose();
});

it('stops stalled work at the overall deadline and aborts outstanding requests', async () => {
  vi.useFakeTimers();
  const budget = createPosterGenerationBudget(100);
  const result = budget.run(() => new Promise<never>(() => {}));
  const assertion = expect(result).rejects.toThrow('time limit');
  await vi.advanceTimersByTimeAsync(100);
  await assertion;
  expect(budget.signal.aborted).toBe(true);
  await expect(budget.request(async () => 'late')).rejects.toThrow('time limit');
});
