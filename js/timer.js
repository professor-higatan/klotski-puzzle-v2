/**
 * Simple second-based game timer.
 * @param {{ onTick?: (elapsed: number) => void }} [options]
 */
export function createTimer({ onTick } = {}) {
  let intervalId = null;
  let elapsedSeconds = 0;
  let paused = false;

  function tick() {
    if (paused) return;
    elapsedSeconds += 1;
    onTick?.(elapsedSeconds);
  }

  return {
    get elapsed() {
      return elapsedSeconds;
    },

    setElapsed(seconds) {
      elapsedSeconds = Math.max(0, seconds | 0);
    },

    isRunning() {
      return intervalId !== null;
    },

    /** Start ticking. Safe to call if already running. */
    start({ reset = false } = {}) {
      if (reset) elapsedSeconds = 0;
      paused = false;
      if (intervalId !== null) return;
      intervalId = setInterval(tick, 1000);
    },

    stop() {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
    },

    resetAndStop() {
      this.stop();
      elapsedSeconds = 0;
      paused = false;
    },
  };
}
