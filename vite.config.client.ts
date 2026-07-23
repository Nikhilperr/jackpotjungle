import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

const capacitorHtml = path.resolve(process.cwd(), "index.capacitor.html");

// Deep import is blocked by package exports — load the compiler via absolute file URL.
const { startCompilerPlugin } = await import(
  pathToFileURL(
    path.resolve(
      process.cwd(),
      "node_modules/@tanstack/start-plugin-core/dist/esm/vite/start-compiler-plugin/plugin.js",
    ),
  ).href
);

const SERVER_FN_BASE = "/_serverFn/";

export default defineConfig(({ mode }) => {
  // Load environment variables for the client bundle build
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {
    // Required by createClientRpc — relative base; fetch interceptor rewrites to VPS.
    "process.env.TSS_SERVER_FN_BASE": JSON.stringify(SERVER_FN_BASE),
    "import.meta.env.TSS_SERVER_FN_BASE": JSON.stringify(SERVER_FN_BASE),
    "process.env.TSS_CLIENT_ENTRY": JSON.stringify("true"),
  };
  for (const [key, value] of Object.entries(env)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define: envDefine,
    plugins: [
      {
        name: "auth-middleware-resolver",
        enforce: "pre",
        resolveId(source) {
          if (
            source.includes("integrations/supabase/auth-middleware") ||
            source.includes("integrations\\supabase\\auth-middleware")
          ) {
            const mockPath = `${process.cwd()}/src/lib/mocks/supabase-auth-mock.ts`;
            console.log(`[auth-middleware-resolver] Intercepted "${source}" -> Mocking to: "${mockPath}"`);
            return mockPath;
          }
          return null;
        },
      },
      // Transform createServerFn().handler(...) into createClientRpc(id) stubs so
      // Capacitor never executes server code in the WebView (AsyncLocalStorage error).
      // IDs match the VPS Start build (sha256 of relativeFilename--export_createServerFn_handler).
      startCompilerPlugin({
        framework: "react",
        environments: [{ name: "client", type: "client" }],
        // Provider is not built here — client env only emits RPC stubs.
        providerEnvName: "ssr",
      }),
      TanStackRouterVite({
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
        autoCodeSplitting: true,
      }),
      react(),
      tsconfigPaths(),
      tailwindcss(),
      {
        name: "capacitor-index-html",
        closeBundle() {
          const outDir = path.resolve(process.cwd(), "dist-client");
          const built = path.join(outDir, "index.capacitor.html");
          const target = path.join(outDir, "index.html");
          if (fs.existsSync(built)) {
            fs.renameSync(built, target);
          }
        },
      },
    ],
    resolve: {
      alias: [
        { find: "@", replacement: `${process.cwd()}/src` },
        // Exact match only — must not swallow @tanstack/react-start/client-rpc
        {
          find: /^@tanstack\/react-start$/,
          replacement: `${process.cwd()}/node_modules/@tanstack/react-start/dist/esm/index.js`,
        },
        {
          find: /^@tanstack\/react-start\/client-rpc$/,
          replacement: `${process.cwd()}/node_modules/@tanstack/react-start/dist/esm/client-rpc.js`,
        },
        // Mock server-only NPM packages
        { find: "pg", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "nodemailer", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "split2", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "pgpass/lib/helper.js", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "pgpass/lib/index.js", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "pg-connection-string", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        // Mock Node.js built-in modules
        { find: "node:async_hooks", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "async_hooks", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "fs", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "node:fs", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "path", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "node:path", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "crypto", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "node:crypto", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "process", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "node:process", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "dns", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "net", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "tls", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "stream", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "util", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "util/types", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "os", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "url", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "events", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "http", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
        { find: "https", replacement: `${process.cwd()}/src/lib/mocks/empty-mock.ts` },
      ],
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    build: {
      outDir: "dist-client",
      emptyOutDir: true,
      sourcemap: false,
      minify: "esbuild",
      rollupOptions: {
        // Keep root index.html for TanStack Start SSR; Capacitor uses its own shell.
        input: capacitorHtml,
      },
    },
  };
});
