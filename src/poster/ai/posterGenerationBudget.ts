export const POSTER_GENERATION_BUDGET_MS = 120_000;
export const POSTER_GENERATION_MAX_CALLS = 2;

/** One deadline across preparation, generation, rendering and review. */
export function createPosterGenerationBudget(durationMs = POSTER_GENERATION_BUDGET_MS) {
  const deadline = Date.now() + durationMs;
  const controller = new AbortController();
  let calls = 0;
  const remaining = () => Math.max(0, deadline - Date.now());
  const expired = () => new Error('Automatic processing reached its time limit. Any draft already on the canvas has been kept.');
  async function run<T>(work: () => Promise<T>): Promise<T> {
    if (!remaining() || controller.signal.aborted) throw expired();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(expired()); }, remaining());
        }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return {
    remaining,
    signal: controller.signal,
    run,
    async request<T>(work: (timeoutMs: number, signal: AbortSignal) => Promise<T>): Promise<T> {
      if (calls >= POSTER_GENERATION_MAX_CALLS) throw new Error('The two automatic AI passes have finished.');
      calls++;
      return run(() => work(Math.min(90_000, remaining()), controller.signal));
    },
    dispose: () => controller.abort(),
  };
}
