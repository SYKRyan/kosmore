# Handoff instructions

Before handing off extension changes for manual testing:

1. Increment the patch version in both `package.json` and `public/manifest.json` (for example, `1.5.0` to `1.5.1`). Keep the two versions identical.
2. Run `pnpm build` from the repository root to regenerate `dist` from the updated source.
3. Verify that `dist/manifest.json` reports the new version. The browser and KosMore Settings display this manifest version.
4. Report the new version in the handoff and point the tester to `dist` to load or reload the unpacked extension.
