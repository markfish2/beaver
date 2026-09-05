/** Event-driven refresh queue, with guards checked again after each request. */
export function createRemoteRefreshQueue(options: {
  blocked: () => boolean;
  version: () => number;
  refresh: (canApply: () => boolean) => Promise<void>;
  delay?: number;
}) {
  let pending = false;
  let running = false;
  let disposed = false;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = (delay = options.delay ?? 200) => {
    clearTimeout(timer);
    if (!disposed) timer = setTimeout(() => { void run(); }, delay);
  };
  const run = async () => {
    if (disposed || running || !pending || options.blocked()) return;
    running = true;
    pending = false;
    const start = revision;
    const version = options.version();
    let failed = false;
    const canApply = () => !disposed && !options.blocked() && start === revision && version === options.version();
    try {
      await options.refresh(canApply);
      if (!canApply()) pending = true;
    } catch (error) {
      failed = true;
      pending = true;
      console.error('跨端更新失败', error);
    } finally {
      running = false;
      if (pending && !disposed && !options.blocked()) schedule(failed ? 3000 : options.delay);
    }
  };
  return {
    invalidate() { revision++; pending = true; schedule(); },
    edited() { revision++; },
    wake() { schedule(); },
    dispose() { disposed = true; clearTimeout(timer); },
  };
}
