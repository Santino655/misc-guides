import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANTE: cambia "mi-repo" por el nombre exacto de tu repositorio
// de GitHub (https://<usuario>.github.io/mi-repo/). Si publicas en un
// dominio propio o en un repo "usuario.github.io", usa base: "/".
export default defineConfig({
  base: "/mi-repo/",
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
