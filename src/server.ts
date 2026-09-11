import { createApp } from "./app.js";
import { getConfig } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { ContactSubmissionRepository } from "./features/contact-submissions/contact-submissions.repository.js";

const config = getConfig();
const pool = createPool(config.databaseUrl);
const app = createApp(new ContactSubmissionRepository(pool));

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}.`);
});
