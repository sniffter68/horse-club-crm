/** Bounded, cancellable work without depending on AbortSignal.any/timeout in older WebViews. */
export async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal, ms = 20000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  parent?.addEventListener('abort', abort, { once: true });
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        const fail = () => reject(controller.signal.reason ?? new Error('Запрос отменён'));
        if (controller.signal.aborted) { fail(); return; }
        controller.signal.addEventListener('abort', fail, { once: true });
        timer = setTimeout(() => controller.abort(new Error('Сервис не ответил вовремя. Повторите попытку.')), ms);
      }),
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(controller.signal); }),
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
  }
}
