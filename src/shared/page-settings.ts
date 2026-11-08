import type { Settings } from "./types";

// Pulsar exclusions omit Vortex, which has separate controls, and the hub.
const PULSAR_GAME = /^\/(?:constellation|aion|photon|horizon|umbra)(?:\/|$)/;
const VORTEX = /^\/vortex(?:\/|$)/;

/** Apply page exclusions without changing the user's saved feature switches. */
export function settingsForPage(
  settings: Settings,
  pathname: string,
): Settings {
  const pulsar = PULSAR_GAME.test(pathname),
    vortex = VORTEX.test(pathname);
  const disableTooltip =
    (pulsar && settings.disableHoverTooltipInPulsar) ||
    (vortex && settings.disableHoverTooltipInVortex);
  const disableOverlays =
    (pulsar && settings.disableCardOverlaysInPulsar) ||
    (vortex && settings.disableCardOverlaysInVortex);
  if (!disableTooltip && !disableOverlays) return settings;
  return {
    ...settings,
    enabled: settings.enabled && !disableTooltip,
    cardOverlaysEnabled: settings.cardOverlaysEnabled && !disableOverlays,
  };
}
