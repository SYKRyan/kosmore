import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { trace: "retain-on-failure" },
  expect: { timeout: 6000 },
});
