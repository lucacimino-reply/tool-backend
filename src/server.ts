import { createApp } from './app.js';
import { config } from './config/config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';

const pool = createPool();

try {
  await migrate(pool);
  const app = createApp(pool, { sessionDurationHours: config.SESSION_DURATION_HOURS, secureCookies: config.NODE_ENV === 'production' });
  app.listen(config.PORT, () => console.info(`Server listening on port ${config.PORT}`));
} catch (error) {
  console.error('Application startup failed', error);
  await pool.end();
  process.exitCode = 1;
}
