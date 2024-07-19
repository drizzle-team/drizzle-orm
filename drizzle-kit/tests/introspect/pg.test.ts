import { PGlite } from "@electric-sql/pglite";
import { SQL, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { introspectPgToFile } from "tests/schemaDiffer";
import { expect, test } from "vitest";

test("basic introspect test", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").notNull(),
      email: text("email"),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "basic-introspect"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});

test("basic identity always test", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").generatedAlwaysAsIdentity(),
      email: text("email"),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "basic-identity-always-introspect"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});

test("basic identity by default test", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").generatedByDefaultAsIdentity(),
      email: text("email"),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "basic-identity-default-introspect"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});

test("identity always test: few params", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").generatedAlwaysAsIdentity({
        startWith: 100,
        name: "custom_name",
      }),
      email: text("email"),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "identity-always-few-params-introspect"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});

test("identity by default test: few params", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").generatedByDefaultAsIdentity({
        maxValue: 10000,
        name: "custom_name",
      }),
      email: text("email"),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "identity-default-few-params-introspect"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});

test("identity always test: all params", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").generatedAlwaysAsIdentity({
        startWith: 10,
        increment: 4,
        minValue: 10,
        maxValue: 10000,
        cache: 100,
        cycle: true,
      }),
      email: text("email"),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "identity-always-all-params-introspect"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});

test("identity by default test: all params", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").generatedByDefaultAsIdentity({
        startWith: 10,
        increment: 4,
        minValue: 10,
        maxValue: 10000,
        cache: 100,
        cycle: true,
      }),
      email: text("email"),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "identity-default-all-params-introspect"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});

test("generated column: link to another column", async () => {
  const client = new PGlite();

  const schema = {
    users: pgTable("users", {
      id: integer("id").generatedAlwaysAsIdentity(),
      email: text("email"),
      generatedEmail: text("generatedEmail").generatedAlwaysAs(
        (): SQL => sql`email`
      ),
    }),
  };

  const { statements, sqlStatements } = await introspectPgToFile(
    client,
    schema,
    "generated-link-column"
  );

  expect(statements.length).toBe(0);
  expect(sqlStatements.length).toBe(0);
});
