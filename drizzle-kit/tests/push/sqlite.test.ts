import { expect, test } from "vitest";
import { DialectSuite, run } from "./common";
import Database from "better-sqlite3";
import { diffTestSchemasPushSqlite } from "tests/schemaDiffer";
import {
  blob,
  foreignKey,
  int,
  integer,
  numeric,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { SQL, sql } from "drizzle-orm";

const sqliteSuite: DialectSuite = {
  addBasicIndexes: function (context?: any): Promise<void> {
    return {} as any;
  },
  changeIndexFields: function (context?: any): Promise<void> {
    return {} as any;
  },
  dropIndex: function (context?: any): Promise<void> {
    return {} as any;
  },

  async allTypes() {
    const sqlite = new Database(":memory:");

    const Users = sqliteTable("users", {
      id: integer("id").primaryKey().notNull(),
      name: text("name").notNull(),
      email: text("email"),
      textJson: text("text_json", { mode: "json" }),
      blobJon: blob("blob_json", { mode: "json" }),
      blobBigInt: blob("blob_bigint", { mode: "bigint" }),
      numeric: numeric("numeric"),
      createdAt: integer("created_at", { mode: "timestamp" }),
      createdAtMs: integer("created_at_ms", { mode: "timestamp_ms" }),
      real: real("real"),
      text: text("text", { length: 255 }),
      role: text("role", { enum: ["admin", "user"] }).default("user"),
      isConfirmed: integer("is_confirmed", {
        mode: "boolean",
      }),
    });

    const schema1 = {
      Users,

      Customers: sqliteTable("customers", {
        id: integer("id").primaryKey(),
        address: text("address").notNull(),
        isConfirmed: integer("is_confirmed", { mode: "boolean" }),
        registrationDate: integer("registration_date", { mode: "timestamp_ms" })
          .notNull()
          .$defaultFn(() => new Date()),
        userId: integer("user_id")
          .references(() => Users.id)
          .notNull(),
      }),

      Posts: sqliteTable("posts", {
        id: integer("id").primaryKey(),
        content: text("content"),
        authorId: integer("author_id"),
      }),
    };

    const { statements } = await diffTestSchemasPushSqlite(
      sqlite,
      schema1,
      schema1,
      [],
      false
    );
    expect(statements.length).toBe(0);
  },
  indexesToBeNotTriggered: function (context?: any): Promise<void> {
    return {} as any;
  },
  indexesTestCase1: function (context?: any): Promise<void> {
    return {} as any;
  },
  async case1(): Promise<void> {
    const sqlite = new Database(":memory:");

    const schema1 = {
      users: sqliteTable("users", {
        id: text("id").notNull().primaryKey(),
        firstName: text("first_name").notNull(),
        lastName: text("last_name").notNull(),
        username: text("username").notNull().unique(),
        email: text("email").notNull().unique(),
        password: text("password").notNull(),
        avatarUrl: text("avatar_url").notNull(),
        postsCount: integer("posts_count").notNull().default(0),
        followersCount: integer("followers_count").notNull().default(0),
        followingsCount: integer("followings_count").notNull().default(0),
        createdAt: integer("created_at").notNull(),
      }),
    };

    const schema2 = {
      users: sqliteTable("users", {
        id: text("id").notNull().primaryKey(),
        firstName: text("first_name").notNull(),
        lastName: text("last_name").notNull(),
        username: text("username").notNull().unique(),
        email: text("email").notNull().unique(),
        password: text("password").notNull(),
        avatarUrl: text("avatar_url").notNull(),
        followersCount: integer("followers_count").notNull().default(0),
        followingsCount: integer("followings_count").notNull().default(0),
        createdAt: integer("created_at").notNull(),
      }),
    };

    const { statements } = await diffTestSchemasPushSqlite(
      sqlite,
      schema1,
      schema2,
      [],
      false
    );
    expect(statements.length).toBe(1);
    expect(statements[0]).toStrictEqual({
      type: "alter_table_drop_column",
      tableName: "users",
      columnName: "posts_count",
      schema: "",
    });
  },
  addNotNull: function (context?: any): Promise<void> {
    return {} as any;
  },
  addNotNullWithDataNoRollback: function (context?: any): Promise<void> {
    return {} as any;
  },
  addBasicSequences: function (context?: any): Promise<void> {
    return {} as any;
  },
  // ---
  addGeneratedColumn: async function (context?: any): Promise<void> {
    const sqlite = new Database(":memory:");

    const from = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
      }),
    };
    const to = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
        generatedName: text("gen_name").generatedAlwaysAs(
          (): SQL => sql`${to.users.name} || 'hello'`,
          { mode: "stored" }
        ),
      }),
    };

    const { statements, sqlStatements } = await diffTestSchemasPushSqlite(
      sqlite,
      from,
      to,
      []
    );

    expect(statements).toStrictEqual([]);
    expect(sqlStatements).toStrictEqual([]);
  },
  addGeneratedToColumn: async function (context?: any): Promise<void> {
    const sqlite = new Database(":memory:");

    const from = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
        generatedName: text("gen_name").notNull(),
        generatedName1: text("gen_name1"),
      }),
    };
    const to = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
        generatedName: text("gen_name")
          .notNull()
          .generatedAlwaysAs((): SQL => sql`${to.users.name} || 'hello'`, {
            mode: "stored",
          }),
        generatedName1: text("gen_name1").generatedAlwaysAs(
          (): SQL => sql`${to.users.name} || 'hello'`,
          { mode: "virtual" }
        ),
      }),
    };

    const { statements, sqlStatements } = await diffTestSchemasPushSqlite(
      sqlite,
      from,
      to,
      []
    );

    expect(statements).toStrictEqual([
      {
        columnAutoIncrement: false,
        columnDefault: undefined,
        columnGenerated: {
          as: "(\"name\" || 'hello')",
          type: "virtual",
        },
        columnName: "gen_name1",
        columnNotNull: false,
        columnOnUpdate: undefined,
        columnPk: false,
        newDataType: "text",
        schema: "",
        tableName: "users",
        type: "alter_table_alter_column_set_generated",
      },
    ]);
    expect(sqlStatements).toStrictEqual([
      "ALTER TABLE `users` DROP COLUMN `gen_name1`;",
      "ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS (\"name\" || 'hello') VIRTUAL;",
    ]);

    for (const st of sqlStatements) {
      sqlite.exec(st);
    }
  },
  dropGeneratedConstraint: async function (context?: any): Promise<void> {
    const sqlite = new Database(":memory:");

    const from = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
        generatedName: text("gen_name").generatedAlwaysAs(
          (): SQL => sql`${to.users.name} || 'hello'`,
          { mode: "stored" }
        ),
        generatedName1: text("gen_name1").generatedAlwaysAs(
          (): SQL => sql`${to.users.name} || 'hello'`,
          { mode: "virtual" }
        ),
      }),
    };
    const to = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
        generatedName: text("gen_name"),
        generatedName1: text("gen_name1"),
      }),
    };

    const { statements, sqlStatements } = await diffTestSchemasPushSqlite(
      sqlite,
      from,
      to,
      []
    );

    expect(statements).toStrictEqual([
      {
        columnAutoIncrement: false,
        columnDefault: undefined,
        columnGenerated: undefined,
        columnName: "gen_name",
        columnNotNull: false,
        columnOnUpdate: undefined,
        columnPk: false,
        newDataType: "text",
        schema: "",
        tableName: "users",
        type: "alter_table_alter_column_drop_generated",
      },
      {
        columnAutoIncrement: false,
        columnDefault: undefined,
        columnGenerated: undefined,
        columnName: "gen_name1",
        columnNotNull: false,
        columnOnUpdate: undefined,
        columnPk: false,
        newDataType: "text",
        schema: "",
        tableName: "users",
        type: "alter_table_alter_column_drop_generated",
      },
    ]);
    expect(sqlStatements).toStrictEqual([
      "ALTER TABLE `users` DROP COLUMN `gen_name`;",
      "ALTER TABLE `users` ADD `gen_name` text;",
      "ALTER TABLE `users` DROP COLUMN `gen_name1`;",
      "ALTER TABLE `users` ADD `gen_name1` text;",
    ]);

    for (const st of sqlStatements) {
      sqlite.exec(st);
    }
  },
  alterGeneratedConstraint: async function (context?: any): Promise<void> {
    const sqlite = new Database(":memory:");

    const from = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
        generatedName: text("gen_name").generatedAlwaysAs(
          (): SQL => sql`${to.users.name} || 'hello'`,
          { mode: "stored" }
        ),
        generatedName1: text("gen_name1").generatedAlwaysAs(
          (): SQL => sql`${to.users.name} || 'hello'`,
          { mode: "virtual" }
        ),
      }),
    };
    const to = {
      users: sqliteTable("users", {
        id: int("id"),
        id2: int("id2"),
        name: text("name"),
        generatedName: text("gen_name").generatedAlwaysAs(
          (): SQL => sql`${to.users.name}`,
          { mode: "stored" }
        ),
        generatedName1: text("gen_name1").generatedAlwaysAs(
          (): SQL => sql`${to.users.name}`,
          { mode: "virtual" }
        ),
      }),
    };

    const { statements, sqlStatements } = await diffTestSchemasPushSqlite(
      sqlite,
      from,
      to,
      []
    );

    expect(statements).toStrictEqual([
      {
        columnAutoIncrement: false,
        columnDefault: undefined,
        columnGenerated: {
          as: '("name")',
          type: "virtual",
        },
        columnName: "gen_name1",
        columnNotNull: false,
        columnOnUpdate: undefined,
        columnPk: false,
        newDataType: "text",
        schema: "",
        tableName: "users",
        type: "alter_table_alter_column_alter_generated",
      },
    ]);
    expect(sqlStatements).toStrictEqual([
      "ALTER TABLE `users` DROP COLUMN `gen_name1`;",
      'ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS ("name") VIRTUAL;',
    ]);

    for (const st of sqlStatements) {
      sqlite.exec(st);
    }
  },
  createTableWithGeneratedConstraint: function (context?: any): Promise<void> {
    return {} as any;
  },
};

run(sqliteSuite);

test("create table with custom name references", async (t) => {
  const sqlite = new Database(":memory:");

  const users = sqliteTable("users", {
    id: int("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
  });

  const schema1 = {
    users,
    posts: sqliteTable(
      "posts",
      {
        id: int("id").primaryKey({ autoIncrement: true }),
        name: text("name"),
        userId: int("user_id"),
      },
      (t) => ({
        fk: foreignKey({
          columns: [t.id],
          foreignColumns: [users.id],
          name: "custom_name_fk",
        }),
      })
    ),
  };

  const schema2 = {
    users,
    posts: sqliteTable(
      "posts",
      {
        id: int("id").primaryKey({ autoIncrement: true }),
        name: text("name"),
        userId: int("user_id"),
      },
      (t) => ({
        fk: foreignKey({
          columns: [t.id],
          foreignColumns: [users.id],
          name: "custom_name_fk",
        }),
      })
    ),
  };

  const { sqlStatements } = await diffTestSchemasPushSqlite(
    sqlite,
    schema1,
    schema2,
    []
  );

  expect(sqlStatements!.length).toBe(0);
});
