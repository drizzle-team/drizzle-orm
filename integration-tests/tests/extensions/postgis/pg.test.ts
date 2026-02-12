import Docker from "dockerode";
import { sql, relations } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  bigserial,
  geometry,
  line,
  pgTable,
  varchar,
  point,
  bigint,
} from "drizzle-orm/pg-core";
import getPort from "get-port";
import pg from "pg";
import { v4 as uuid } from "uuid";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

const { Client } = pg;

const ENABLE_LOGGING = false;

const items = pgTable("items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  point: point("point"),
  pointObj: point("point_xy", { mode: "xy" }),
  line: line("line"),
  lineObj: line("line_abc", { mode: "abc" }),
  geo: geometry("geo", { type: "point" }),
  geoObj: geometry("geo_obj", { type: "point", mode: "xy" }),
  geoSrid: geometry("geo_options", { type: "point", mode: "xy", srid: 4000 }),
});

const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 256 }),
  itemId: bigint("item_id", { mode: "number" }).references(() => items.id),
  position: geometry("position", { type: "Point", mode: "tuple", srid: 4326 }),
});

const userRelations = relations(users, ({ one }) => ({
  item: one(items, {
    fields: [users.itemId],
    references: [items.id],
  }),
}));

const schema = {
  users,
  items,
  userRelations,
};

type DbSchema = typeof schema;

let pgContainer: Docker.Container;
let docker: Docker;
let client: pg.Client;
let db: NodePgDatabase<DbSchema>;

async function createDockerDB(): Promise<string> {
  const inDocker = (docker = new Docker());
  const port = await getPort({ port: 5432 });
  const image = "postgis/postgis:16-3.4";

  const pullStream = await docker.pull(image);
  await new Promise((resolve, reject) =>
    inDocker.modem.followProgress(pullStream, (err) =>
      err ? reject(err) : resolve(err)
    )
  );

  pgContainer = await docker.createContainer({
    Image: image,
    Env: [
      "POSTGRES_PASSWORD=postgres",
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=postgres",
    ],
    name: `drizzle-integration-tests-${uuid()}`,
    HostConfig: {
      AutoRemove: true,
      PortBindings: {
        "5432/tcp": [{ HostPort: `${port}` }],
      },
    },
  });

  await pgContainer.start();

  return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

beforeAll(async () => {
  const connectionString =
    process.env["PG_POSTGIS_CONNECTION_STRING"] ?? (await createDockerDB());

  const sleep = 1000;
  let timeLeft = 20000;
  let connected = false;
  let lastError: unknown | undefined;
  do {
    try {
      client = new Client(connectionString);
      await client.connect();
      connected = true;
      break;
    } catch (e) {
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, sleep));
      timeLeft -= sleep;
    }
  } while (timeLeft > 0);
  if (!connected) {
    console.error("Cannot connect to Postgres");
    await client?.end().catch(console.error);
    await pgContainer?.stop().catch(console.error);
    throw lastError;
  }
  db = drizzle(client, { schema, logger: ENABLE_LOGGING });

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
});

afterAll(async () => {
  await client?.end().catch(console.error);
  await pgContainer?.stop().catch(console.error);
});

beforeEach(async () => {
  //? First, recreate items table.
  await db.execute(sql`drop table if exists items cascade`);
  await db.execute(sql`
    CREATE TABLE items (
              id bigserial PRIMARY KEY, 
              "point" point,
              "point_xy" point,
              "line" line,
              "line_abc" line,
    		  "geo" geometry(point),
    		  "geo_obj" geometry(point),
    		  "geo_options" geometry(point,4000)
          );
  `);

  //? Now, repeat for users.
  await db.execute(sql`drop table if exists users cascade`);
  await db.execute(sql`
    CREATE TABLE users (
    	id bigserial PRIMARY KEY,
    	name varchar(256),
    	item_id bigint REFERENCES items(id),
    	position geometry(Point, 4326)
    );
  `);
});

test("insert + select", async () => {
  const insertedValues = await db
    .insert(items)
    .values([
      {
        point: [1, 2],
        pointObj: { x: 1, y: 2 },
        line: [1, 2, 3],
        lineObj: { a: 1, b: 2, c: 3 },
        geo: [1, 2],
        geoObj: { x: 1, y: 2 },
        geoSrid: { x: 1, y: 2 },
      },
    ])
    .returning();

  const response = await db.select().from(items);

  expect(insertedValues).toStrictEqual([
    {
      id: 1,
      point: [1, 2],
      pointObj: { x: 1, y: 2 },
      line: [1, 2, 3],
      lineObj: { a: 1, b: 2, c: 3 },
      geo: [1, 2],
      geoObj: { x: 1, y: 2 },
      geoSrid: { x: 1, y: 2 },
    },
  ]);

  expect(response).toStrictEqual([
    {
      id: 1,
      point: [1, 2],
      pointObj: { x: 1, y: 2 },
      line: [1, 2, 3],
      lineObj: { a: 1, b: 2, c: 3 },
      geo: [1, 2],
      geoObj: { x: 1, y: 2 },
      geoSrid: { x: 1, y: 2 },
    },
  ]);
});

test("insert + query", async () => {
  const insertedItems = await db
    .insert(items)
    .values([
      {
        point: [1, 2],
        pointObj: { x: 1, y: 2 },
        line: [1, 2, 3],
        lineObj: { a: 1, b: 2, c: 3 },
        geo: [1, 2],
        geoObj: { x: 1, y: 2 },
        geoSrid: { x: 1, y: 2 },
      },
    ])
    .returning();

  expect(insertedItems).toStrictEqual([
    {
      id: 1,
      point: [1, 2],
      pointObj: { x: 1, y: 2 },
      line: [1, 2, 3],
      lineObj: { a: 1, b: 2, c: 3 },
      geo: [1, 2],
      geoObj: { x: 1, y: 2 },
      geoSrid: { x: 1, y: 2 },
    },
  ]);

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        name: "Alice",
        itemId: insertedItems[0]!.id,
        position: [10, 20],
      },
    ])
    .returning();

  expect(insertedUsers).toStrictEqual([
    {
      id: 1,
      name: "Alice",
      itemId: insertedItems[0]!.id,
      position: [10, 20],
    },
  ]);

  const queryGeometry = await db.query.items.findFirst();
  const queryUser = await db.query.users.findFirst();

  expect(queryGeometry).toStrictEqual({
    id: 1,
    point: [1, 2],
    pointObj: { x: 1, y: 2 },
    line: [1, 2, 3],
    lineObj: { a: 1, b: 2, c: 3 },
    geo: [1, 2],
    geoObj: { x: 1, y: 2 },
    geoSrid: { x: 1, y: 2 },
  });

  expect(queryUser).toStrictEqual({
    id: 1,
    name: "Alice",
    itemId: insertedItems[0]!.id,
    position: [10, 20],
  });
});

test("relations with geometry", async () => {
  const insertedItems = await db
    .insert(items)
    .values([
      {
        point: [1, 2],
        pointObj: { x: 1, y: 2 },
        line: [1, 2, 3],
        lineObj: { a: 1, b: 2, c: 3 },
        geo: [1, 2],
        geoObj: { x: 1, y: 2 },
        geoSrid: { x: 1, y: 2 },
      },
    ])
    .returning();

  expect(insertedItems).toStrictEqual([
    {
      id: 1,
      point: [1, 2],
      pointObj: { x: 1, y: 2 },
      line: [1, 2, 3],
      lineObj: { a: 1, b: 2, c: 3 },
      geo: [1, 2],
      geoObj: { x: 1, y: 2 },
      geoSrid: { x: 1, y: 2 },
    },
  ]);

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        name: "Alice",
        itemId: insertedItems[0]!.id,
        position: [10, 20],
      },
    ])
    .returning();

  expect(insertedUsers).toStrictEqual([
    {
      id: 1,
      name: "Alice",
      itemId: insertedItems[0]!.id,
      position: [10, 20],
    },
  ]);

  const queryUser = await db.query.users.findFirst({
    with: {
      item: true,
    },
  });

  expect(queryUser).toStrictEqual({
    id: 1,
    name: "Alice",
    itemId: insertedItems[0]!.id,
    position: [10, 20],
    item: {
      id: 1,
      point: [1, 2],
      pointObj: { x: 1, y: 2 },
      line: [1, 2, 3],
      lineObj: { a: 1, b: 2, c: 3 },
      geo: [1, 2],
      geoObj: { x: 1, y: 2 },
      geoSrid: { x: 1, y: 2 },
    },
  });
});
