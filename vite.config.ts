import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/misc-guides/",
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
