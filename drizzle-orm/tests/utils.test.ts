import { expect, test } from "vitest";
import { getTableColumns } from "~/index.ts";
import { pgTable, serial, text } from "~/pg-core/index.ts";

const pgExampleTable = pgTable("test", {
  id: serial("d").primaryKey(),
  exists: text("exists").notNull(),
  ignored: text("ignored").$ignore(),
});

test("getTableColumns excludes ignored columns", () => {
  const columns = getTableColumns(pgExampleTable);

  expect(Object.keys(columns)).toHaveLength(2);
  expect(Object.keys(columns)).toEqual(["id", "exists"]);
});
