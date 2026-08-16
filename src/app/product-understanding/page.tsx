import { redirect } from "next/navigation";

import { requireIdentity } from "@/auth/require-identity";
import { loadOnboardingState } from "@/app/onboarding/actions";

import {
  analyzeProductUrl,
  loadProductUnderstandingState,
  verifyProductUnderstanding,
} from "./actions";
import { ProductUnderstanding } from "./product-understanding";

export const metadata = { title: "Verify product understanding" };
export const dynamic = "force-dynamic";

export default async function ProductUnderstandingPage() {
  await requireIdentity();
  const onboarding = await loadOnboardingState();
  if (!onboarding.workspaceId) redirect("/onboarding");
  const initialState = await loadProductUnderstandingState(onboarding.workspaceId);
  return (
    <ProductUnderstanding
      initialState={initialState}
      analyzeAction={analyzeProductUrl}
      verifyAction={verifyProductUnderstanding}
    />
  );
}
