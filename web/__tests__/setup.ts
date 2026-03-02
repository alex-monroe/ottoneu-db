import { mock } from "bun:test";
mock.module("@/lib/supabase", () => {
  return { supabase: {} };
});
