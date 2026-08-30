import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from '@deno/vite-plugin';

export default defineConfig({
  base: "/misc-guides/",
  plugins: [
    deno(),
    react(),
  ],
  build: {
    outDir: "dist",
  },
});
