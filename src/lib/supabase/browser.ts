"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

export function createBrowserSupabaseClient() {
  const config = getSupabaseConfig();
  return createBrowserClient(config.url, config.publishableKey);
}
