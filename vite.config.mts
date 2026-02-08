import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const clientPort = env.PORT ? parseInt(env.PORT) : 3000;
  // Wrangler dev runs on port 8787 by default
  const apiPort = 8787;

  return {
    plugins: [tailwindcss(), tsconfigPaths(), react()],
    build: {
      sourcemap: true,
      outDir: "dist",
      // Ensure hash-based filenames for cache busting
      rollupOptions: {
        output: {
          // Add hash to filenames for cache busting
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return "assets/[name]-[hash].css";
            }
            return "assets/[name]-[hash].[ext]";
          },
        },
      },
    },
    server: {
      port: clientPort,
      proxy: {
        "/api/ws": {
          target: `ws://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          ws: true,
        },
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
