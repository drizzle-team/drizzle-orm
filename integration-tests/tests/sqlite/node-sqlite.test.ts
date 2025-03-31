import { DatabaseSync } from "node:sqlite";
import { sql } from "drizzle-orm";
import { type NodeSQLiteDatabase, drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { skipTests } from "~/common";
import {
  anotherUsersMigratorTable,
  tests,
  usersMigratorTable,
} from "./sqlite-common";

const ENABLE_LOGGING = false;

let db: NodeSQLiteDatabase;
let client: DatabaseSync;

beforeAll(async () => {
  const dbPath = process.env["SQLITE_DB_PATH"] ?? ":memory:";
  client = new DatabaseSync(dbPath);
  db = drizzle(client, { logger: ENABLE_LOGGING });
});

afterAll(async () => {
  client?.close();
});

beforeEach((ctx) => {
  ctx.sqlite = {
    db,
  };
});

test("migrator", async () => {
  db.run(sql`drop table if exists another_users`);
  db.run(sql`drop table if exists users12`);
  db.run(sql`drop table if exists __drizzle_migrations`);

  migrate(db, { migrationsFolder: "./drizzle2/sqlite" });

  db.insert(usersMigratorTable).values({ name: "John", email: "email" }).run();
  const result = db.select().from(usersMigratorTable).all();

  db.insert(anotherUsersMigratorTable)
    .values({ name: "John", email: "email" })
    .run();
  const result2 = db.select().from(anotherUsersMigratorTable).all();

  expect(result).toEqual([{ id: 1, name: "John", email: "email" }]);
  expect(result2).toEqual([{ id: 1, name: "John", email: "email" }]);

  db.run(sql`drop table another_users`);
  db.run(sql`drop table users12`);
  db.run(sql`drop table __drizzle_migrations`);
});

skipTests([
  // WIP
]);
tests();
