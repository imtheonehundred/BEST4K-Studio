import type { B4kApi } from '../preload/index';
declare global {
  interface Window {
    api: B4kApi;
  }
}
export {};
