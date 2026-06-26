/**
 * Native Integration Utilities
 * Handles safe retrieval of Capacitor plugins with stubs for web/unsupported platforms
 */

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * Safely resolves a Capacitor plugin. If it is unavailable or fails to load,
 * returns a safe stub object that logs warnings but prevents runtime crashes.
 */
export function getSafePlugin<T extends object>(pluginName: string, fallbackStub: T): T {
  if (!isNative()) {
    return fallbackStub;
  }

  try {
    const cap = (window as any).Capacitor;
    const plugin = cap?.Plugins?.[pluginName];
    if (plugin) {
      return plugin as T;
    }
  } catch (error) {
    console.warn(`[NativeBridge] Failed to load plugin "${pluginName}":`, error);
  }

  // Create a proxy that intercepts calls and returns resolved/rejected promises gracefully
  return new Proxy(fallbackStub, {
    get(target, prop) {
      const originalValue = Reflect.get(target, prop);
      if (typeof originalValue === "function") {
        return originalValue;
      }
      // If the function doesn't exist on the fallback stub, return a safe dummy function
      return () => {
        console.warn(`[NativeBridge] Plugin "${pluginName}" function "${String(prop)}" called but is unavailable.`);
        return Promise.resolve();
      };
    }
  }) as T;
}
