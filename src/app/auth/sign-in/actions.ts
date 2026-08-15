"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";

import { safeReturnPath } from "@/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFeature } from "@/observability/feature-flags";

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  next: z.string().optional(),
});

export async function signIn(formData: FormData) {
  requireFeature("authentication");
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/auth/sign-in?error=invalid_input" as Route);
  }

  const client = await createServerSupabaseClient();
  const { error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    redirect("/auth/sign-in?error=invalid_credentials" as Route);
  }

  redirect(safeReturnPath(parsed.data.next) as Route);
}
