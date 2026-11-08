import type { Settings } from "./types";

// Vortex and the Pulsar hub keep their normal tooltip and overlay settings.
const PULSAR_GAME = /^\/(?:constellation|aion|photon|horizon|umbra)(?:\/|$)/;

/** Apply page exclusions without changing the user's saved feature switches. */
export function settingsForPage(
  settings: Settings,
  pathname: string,
): Settings {
  if (!PULSAR_GAME.test(pathname)) return settings;
  return {
    ...settings,
    enabled: settings.enabled && !settings.disableHoverTooltipInPulsar,
    cardOverlaysEnabled:
      settings.cardOverlaysEnabled && !settings.disableCardOverlaysInPulsar,
  };
}
