// Mock implementation of server-only modules and utilities for client SPA builds

export class AsyncLocalStorage {
  disable() {}
  getStore() {
    return null;
  }
  run(store: any, callback: (...args: any[]) => any, ...args: any[]) {
    return callback(...args);
  }
  exit(callback: (...args: any[]) => any, ...args: any[]) {
    return callback(...args);
  }
  enterWith(store: any) {}
}

export default {};
