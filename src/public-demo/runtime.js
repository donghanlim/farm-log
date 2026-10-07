import { demoApi, resetDemo, demoStorageInfo } from './demo-api.js';

export const request = demoApi;
export const resetRuntime = resetDemo;
export function runtimeInfo() {
  return { publicDemo: true, ...demoStorageInfo() };
}
