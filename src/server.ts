import app from './app';
import config from './config';

const { port } = config;

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function getNextMonthlyRestartDate(): Date {
  const now = new Date();
  const thisMonthTarget = new Date(now.getFullYear(), now.getMonth(), 1, 3, 0, 0, 0);
  if (now < thisMonthTarget) {
    return thisMonthTarget;
  }

  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 3, 0, 0, 0);
}

function scheduleProcessExit(targetDate: Date): void {
  const targetTimestamp = targetDate.getTime();

  const scheduleNextChunk = () => {
    const now = Date.now();
    const remaining = targetTimestamp - now;

    if (remaining <= 0) {
      console.log('[Maintenance] Triggering monthly restart via process.exit(0)');
      process.exit(0);
      return;
    }

    const delay = Math.min(remaining, MAX_TIMEOUT_MS);
    setTimeout(scheduleNextChunk, delay);
  };

  scheduleNextChunk();
}

function scheduleMonthlyRestart(): void {
  const nextRestart = getNextMonthlyRestartDate();
  console.log(`[Maintenance] Next scheduled restart at ${nextRestart.toISOString()}`);
  scheduleProcessExit(nextRestart);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  scheduleMonthlyRestart();
});
