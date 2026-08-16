import { notFound } from "next/navigation";

import { ProductUnderstandingFixture } from "./product-understanding-fixture";

export const dynamic = "force-dynamic";

export default function ProductUnderstandingTestPage() {
  if (process.env.APP_ENV !== "test" || process.env.PLAYWRIGHT_TEST !== "1") notFound();
  return <ProductUnderstandingFixture />;
}
