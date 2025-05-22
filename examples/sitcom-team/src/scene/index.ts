// src/scene/index.ts

import { logger } from './config.js';
import { SceneGenerator } from './scene.js';

(async () => {
  try {
    const scene = new SceneGenerator();
    await scene.run();
  } catch (error: unknown) {
    logger.error('❌  Fatal error in application:', error);
    process.exit(1); // Exit with an error code
  }
})();
