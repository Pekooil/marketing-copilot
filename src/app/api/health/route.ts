import { MIGRATION_VERSION } from "@/db/migration";
import { serverEnvironment } from "@/lib/env/server";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "marketing-copilot-web",
      environment: serverEnvironment.APP_ENV,
      version: serverEnvironment.APP_VERSION,
      migration: MIGRATION_VERSION,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
