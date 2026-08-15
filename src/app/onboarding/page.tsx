import { requireIdentity } from "@/auth/require-identity";

import { OnboardingWizard } from "./wizard";
import { SetupPending } from "./setup-pending";
import { isFeatureEnabled } from "@/observability/feature-flags";

export const metadata = { title: "Set up workspace" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireIdentity();
  if (!isFeatureEnabled("onboarding")) return <SetupPending />;
  return <OnboardingWizard />;
}
