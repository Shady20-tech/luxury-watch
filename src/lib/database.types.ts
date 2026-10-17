/**
 * Database types.
 *
 * PLACEHOLDER — this file is generated, not hand-written. Phase 2 creates the
 * real schema and replaces this file with the output of:
 *
 *   npx supabase gen types typescript --project-id <project-ref> --schema public \
 *     > src/lib/database.types.ts
 *
 * The shape below is the minimum that makes `createClient<Database>()` compile
 * before any tables exist. It is intentionally empty rather than filled with
 * invented tables, because a fabricated schema would be a lie that later code
 * could accidentally depend on. ESLint and Prettier both ignore this file.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
