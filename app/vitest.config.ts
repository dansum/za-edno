import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Тестовете за внос/износ ползват DOMParser, който го няма в Node,
// затова се пуска браузърна среда (happy-dom).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
  },
});
