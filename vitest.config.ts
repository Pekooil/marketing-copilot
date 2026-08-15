import { defineConfig, defineProject } from "vitest/config";
import { fileURLToPath } from "node:url";

const shared = {
  environment: "node" as const,
  passWithNoTests: true,
  reporters: process.env.CI ? (["default", "junit"] as const) : (["default"] as const),
  outputFile: process.env.CI ? "test-results/vitest.xml" : undefined,
};

const resolve = {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/setup/server-only.ts", import.meta.url)),
  },
};

export default defineConfig({
  resolve,
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
    },
    projects: [
      defineProject({ resolve, test: { ...shared, name: "unit", include: ["tests/unit/**/*.test.ts"] } }),
      defineProject({ resolve, test: { ...shared, name: "component", environment: "jsdom", setupFiles: ["tests/setup/component.ts"], include: ["tests/components/**/*.test.tsx"] } }),
      defineProject({ resolve, test: { ...shared, name: "integration", include: ["tests/integration/**/*.test.ts"] } }),
      defineProject({ resolve, test: { ...shared, name: "isolation", include: ["tests/isolation/**/*.test.ts"] } }),
    ],
  },
});
