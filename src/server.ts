import { createApp } from "./app.js";
import { config } from "./config/config.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { createSubmissionRepository } from "./features/contacts/contacts.repository.js";

async function start(): Promise<void> {
  try {
    await migrate(pool, config.migrationTimeoutMs);
    const app = createApp(createSubmissionRepository(pool));
    app.listen(config.port, () => {
      console.info(`Contact submission API listening on port ${config.port}`);
    });
  } catch (error) {
    console.error("Backend startup failed", error);
    await pool.end();
    process.exitCode = 1;
  }
}

void start();
