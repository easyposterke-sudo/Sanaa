/** Bound optional preparation without abandoning a usable draft. */
export async function optionalReferenceTask<T>(task: Promise<T>, timeoutMs = 15_000): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
