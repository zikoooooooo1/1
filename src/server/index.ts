import { Store } from './db.js';
import { createApp, expireAttempts } from './app.js';
const db = new Store();
const app = await createApp(db);
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(JSON.stringify({ level: 'info', event: 'listening', port })),
);
const timer = setInterval(() => {
  try {
    expireAttempts(db);
  } catch {
    console.error(JSON.stringify({ level: 'error', event: 'attempt_expiration_failed' }));
  }
}, 15000);
timer.unref();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => {
      db.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
