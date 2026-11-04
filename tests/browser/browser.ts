import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function launchTestBrowser(
  profile: string,
  options: Parameters<typeof chromium.launchPersistentContext>[1],
) {
  const explicit = process.env.KOSMORE_CHROMIUM_EXECUTABLE;
  try {
    return await chromium.launchPersistentContext(profile, {
      ...options,
      executablePath: explicit,
    });
  } catch (error) {
    // Some managed Windows hosts cannot activate downloaded Chrome's private assembly.
    // Edge still supports unpacked extensions in an isolated test profile; branded Chrome does not.
    const edge = join(
      process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
      "Microsoft/Edge/Application/msedge.exe",
    );
    if (
      explicit ||
      process.platform !== "win32" ||
      !existsSync(edge) ||
      !(error instanceof Error) ||
      !/spawn UNKNOWN|Executable doesn't exist/.test(error.message)
    )
      throw error;
    console.warn(
      "Downloaded Chromium could not start; verifying the unpacked extension in installed Chromium-based Edge.",
    );
    return chromium.launchPersistentContext(profile, {
      ...options,
      executablePath: edge,
    });
  }
}
