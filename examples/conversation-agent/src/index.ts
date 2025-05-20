// src/index.ts

import { logger } from "./config";
import { Agent } from "./agent";

(async () => {
  try {
    const agent = new Agent();
    await agent.run();
  } catch (error: unknown) {
    logger.error("❌  Fatal error in application:", error);
    process.exit(1); // Exit with an error code
  }
})();
