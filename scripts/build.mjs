import { build } from "vite";
import { resolve } from "node:path";
import { generateIcons } from "./icons.mjs";
await generateIcons();
const watch = process.argv.includes("--watch");
const common = {
  configFile: false,
  base: "./",
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "chrome120",
    sourcemap: true,
    ...(watch ? { watch: {} } : {}),
  },
};
await build({
  ...common,
  build: {
    ...common.build,
    emptyOutDir: true,
    lib: {
      entry: resolve("src/content/index.ts"),
      name: "KosMore",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
await build({
  ...common,
  build: {
    ...common.build,
    lib: {
      // Page-world relay for market responses (see src/page-hook.ts).
      entry: resolve("src/page-hook.ts"),
      name: "KosMorePageRelay",
      formats: ["iife"],
      fileName: () => "page-hook.js",
    },
  },
});
await build({
  ...common,
  build: {
    ...common.build,
    lib: {
      entry: resolve("src/background.ts"),
      formats: ["es"],
      fileName: () => "background.js",
    },
  },
});
await build({
  ...common,
  publicDir: "public",
  build: { ...common.build, rollupOptions: { input: resolve("options.html") } },
});
