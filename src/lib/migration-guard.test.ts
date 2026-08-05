import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// The hnsw vector index (match_queue_embedding_idx) cannot be modelled in
// schema.prisma, so prisma migrate dev used to emit DROP INDEX for it in every
// generated migration. That is now prevented by marking match_queue_entries as
// an external table in prisma.config.ts — this test is the backstop in case
// the config is removed or the exclusion silently stops working.
//
// 20260324143847_empathv0_1 is allowlisted: it already shipped with the drop,
// and 20260412000000_restore_vector_index re-created the index afterwards.
const ALLOWLISTED = new Set(["20260324143847_empathv0_1"]);

const MIGRATIONS_DIR = join(__dirname, "..", "..", "prisma", "migrations");

describe("migration guard", () => {
  it("no migration drops the hnsw vector index", () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(MIGRATIONS_DIR)) {
      if (ALLOWLISTED.has(entry)) continue;
      const sqlPath = join(MIGRATIONS_DIR, entry, "migration.sql");
      if (!existsSync(sqlPath)) continue;
      const sql = readFileSync(sqlPath, "utf-8");
      // Only flag active statements — hand-edited migrations keep the dropped
      // line in comments as a warning, which is fine.
      const activeSql = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
      if (activeSql.includes('DROP INDEX "match_queue_embedding_idx"')) {
        offenders.push(entry);
      }
    }
    expect(
      offenders,
      `These migrations would drop the hnsw vector index that matching depends on: ${offenders.join(", ")}. ` +
        "Remove the DROP INDEX statement (see prisma.config.ts).",
    ).toEqual([]);
  });

  it("prisma.config.ts still marks match_queue_entries as external", () => {
    const configPath = join(__dirname, "..", "..", "prisma.config.ts");
    expect(existsSync(configPath)).toBe(true);
    const config = readFileSync(configPath, "utf-8");
    expect(config).toContain('external: ["public.match_queue_entries"]');
  });
});
