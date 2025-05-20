// src/scene/index.ts

import { logger } from './config';
import { SceneGenerator } from './scene';

(async () => {
  try {
    const scene = new SceneGenerator();
    await scene.run();
  } catch (error: unknown) {
    logger.error('❌  Fatal error in application:', error);
    process.exit(1); // Exit with an error code
  }
})();
