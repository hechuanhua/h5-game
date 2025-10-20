import { defineConfig } from "vite";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // for supporting alias in less
    alias: [{ find: /^@(\/.*)/, replacement: join(process.cwd(), "src/$1") }],
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        exportType: "named",
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: "**/*.svg",
    }),
  ],
});
