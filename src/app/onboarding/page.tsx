import { requireIdentity } from "@/auth/require-identity";

import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Set up workspace" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireIdentity();
  return <OnboardingWizard />;
}
