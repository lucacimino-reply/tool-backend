import { createApp } from "./app.js";
import { getConfig } from "./config/environment.js";
import { waitForMigrations } from "./db/migrate.js";
import { createPool } from "./db/pool.js";
import { createSubmissionRepository } from "./features/contacts/contacts.repository.js";

const config = getConfig();
const pool = createPool();

waitForMigrations(pool, config.migrationTimeoutMs)
  .then(() => {
    const app = createApp(createSubmissionRepository(pool));
    app.listen(config.port, () => console.log(`Listening on port ${config.port}`));
  })
  .catch(async (error: unknown) => {
    console.error("Startup failed", error);
    await pool.end();
    process.exitCode = 1;
  });
