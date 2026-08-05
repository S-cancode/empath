import { defineConfig } from "prisma/config";

// match_queue_entries is excluded from Prisma Migrate's diffing because its
// hnsw vector index (match_queue_embedding_idx, on the Unsupported("vector")
// column) cannot be modelled in schema.prisma — without this, EVERY generated
// migration includes `DROP INDEX "match_queue_embedding_idx"` (it already
// slipped through once; see 20260324143847 and the restore migration
// 20260412000000). The Prisma Client still queries the model normally.
//
// Consequence: schema changes to match_queue_entries must be written as
// hand-authored SQL migrations from now on.
export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: {
    externalTables: true,
  },
  tables: {
    external: ["public.match_queue_entries"],
  },
});
