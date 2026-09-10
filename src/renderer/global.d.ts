import type { CairnApi } from '../preload/index.js';

declare global {
  interface Window { cairn: CairnApi }
}

export {};
