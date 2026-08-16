import { notFound } from "next/navigation";

import { MetricsFixture } from "./metrics-fixture";

export const dynamic = "force-dynamic";

export default function MetricsTestPage() {
  if (process.env.APP_ENV !== "test" || process.env.PLAYWRIGHT_TEST !== "1") notFound();
  return <MetricsFixture />;
}
