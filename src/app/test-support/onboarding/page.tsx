import { notFound } from "next/navigation";

import { OnboardingWizard } from "@/app/onboarding/wizard";

export const dynamic = "force-dynamic";

export default function OnboardingTestPage() {
  if (process.env.APP_ENV !== "test" || process.env.PLAYWRIGHT_TEST !== "1") notFound();
  return <OnboardingWizard />;
}
