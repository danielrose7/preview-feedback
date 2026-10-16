import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Vite pre-bundles dependencies with esbuild and does not apply the widget's own tsconfig.
    esbuildOptions: { tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } } },
  },
});
