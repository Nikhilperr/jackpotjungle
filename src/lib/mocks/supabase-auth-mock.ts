import { createMiddleware } from "@tanstack/react-start";

/**
 * Client stub for requireSupabaseAuth.
 * Real auth runs on the VPS; the browser only needs a valid Start middleware
 * object so .middleware([requireSupabaseAuth]) does not crash.
 * Bearer tokens are attached by attachSupabaseAuth (global functionMiddleware).
 */
export const requireSupabaseAuth = createMiddleware({ type: "function" });
