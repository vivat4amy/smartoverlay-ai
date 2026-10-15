/** Очередь на один захват/анализ за раз (оверлей + голосовой ассистент). */
let tail: Promise<unknown> = Promise.resolve();

export function withVisionLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = tail.then(() => fn());
  tail = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}
