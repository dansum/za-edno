import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// GitHub Pages сервира проекта на адрес <потребител>.github.io/<хранилище>/,
// затова пътищата трябва да са относителни спрямо тази подпапка.
// Името се подава при build чрез променливата BASE_PATH (виж .github/workflows/deploy.yml).
// Локално и при собствен домейн остава "/".
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    // изходните карти помагат при разчитане на грешки от реални потребители
    sourcemap: true,
    // Две отделни страници (§8.3): index.html (картата) и admin.html (таблото
    // "Моите карти") - без това admin.html не влиза в изградения dist/.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
      },
    },
  },
});
