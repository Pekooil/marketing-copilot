import "server-only";

import { z } from "zod";

export type FeatureFlag = "authentication" | "onboarding";

const flagSchema = z.enum(["on", "off"]).default("on");

export function isFeatureEnabled(flag: FeatureFlag) {
  const value =
    flag === "authentication"
      ? process.env.FEATURE_AUTHENTICATION
      : process.env.FEATURE_ONBOARDING;
  return flagSchema.parse(value) === "on";
}

export function requireFeature(flag: FeatureFlag) {
  if (!isFeatureEnabled(flag)) throw new FeatureDisabledError(flag);
}

export class FeatureDisabledError extends Error {
  readonly code = "FEATURE_DISABLED";
  constructor(readonly flag: FeatureFlag) {
    super(`${flag} is unavailable.`);
  }
}
