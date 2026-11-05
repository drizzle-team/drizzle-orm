import { describe, expect, test } from 'bun:test';
import { pgEnum, pgSchema, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { emitEventsTableDdl } from '../server/events-table-ddl.js';

const moodEnum = pgEnum('ddl_test_mood', ['sad', 'ok', 'happy']);
const schemaEnum = pgSchema('ddl_test_schema').enum('ddl_test_status', ['open', 'closed']);

const sourceTable = pgTable('ddlfixture', {
  id: serial('id').primaryKey(),
  moodCol: moodEnum('mood_col'),
  tagsCol: text('tags_col').array(),
  timesCol: timestamp('times_col', { withTimezone: true }).array(),
});

const enumInSchemaTable = pgTable('ddlenumfixture', {
  id: serial('id').primaryKey(),
  statusCol: schemaEnum('status_col'),
});

function createTableOf(sourceTable: Parameters<typeof emitEventsTableDdl>[0]): string {
  const statement = emitEventsTableDdl(sourceTable).at(-1);
  if (statement === undefined) throw new Error('expected a CREATE TABLE statement');
  return statement;
}

describe('emitEventsTableDdl', () => {
  test('returns CREATE SCHEMA, DROP TABLE IF EXISTS, then a CREATE TABLE for the synthesized table', () => {
    const statements = emitEventsTableDdl(sourceTable);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toBe('CREATE SCHEMA IF NOT EXISTS "drizzle_pulse"');
    expect(statements[1]).toBe('DROP TABLE IF EXISTS "drizzle_pulse"."public_ddlfixture"');
    expect(statements[2]).toStartWith('CREATE TABLE "drizzle_pulse"."public_ddlfixture" (');
  });

  test('renders the PK line NOT NULL and the serial source column as plain integer', () => {
    const createTable = createTableOf(sourceTable);
    expect(createTable).toContain('"id" integer NOT NULL');
    expect(createTable).not.toMatch(/"id"\s+serial/);
  });

  test('renders $snapshot as an identity column with no trailing NOT NULL', () => {
    const createTable = createTableOf(sourceTable);
    expect(createTable).toContain('"$snapshot" integer GENERATED ALWAYS AS IDENTITY');
    expect(createTable).not.toMatch(/"\$snapshot"[^,]*NOT NULL/);
  });

  test('renders $op as text NOT NULL', () => {
    const createTable = createTableOf(sourceTable);
    expect(createTable).toContain('"$op" text NOT NULL');
  });

  test('renders $timestamp with both DEFAULT now() and NOT NULL', () => {
    const createTable = createTableOf(sourceTable);
    expect(createTable).toContain('"$timestamp" timestamp with time zone DEFAULT now() NOT NULL');
  });

  test('renders an $old_ twin line as nullable (no NOT NULL suffix)', () => {
    const createTable = createTableOf(sourceTable);
    const oldIdLine = createTable.split('\n').find((line) => line.includes('"$old_id"'));
    expect(oldIdLine).toBeDefined();
    expect(oldIdLine).not.toMatch(/NOT NULL/);
  });

  test('honors an explicit eventsSchema override', () => {
    const statements = emitEventsTableDdl(sourceTable, { eventsSchema: 'custom_schema' });
    expect(statements[0]).toBe('CREATE SCHEMA IF NOT EXISTS "custom_schema"');
    expect(statements[1]).toBe('DROP TABLE IF EXISTS "custom_schema"."public_ddlfixture"');
    expect(statements[2]).toStartWith('CREATE TABLE "custom_schema".');
  });

  test('renders array source columns with a [] suffix, not a bare scalar type', () => {
    const createTable = createTableOf(sourceTable);
    expect(createTable).toContain('"tags_col" text[]');
    expect(createTable).toContain('"times_col" timestamp with time zone[]');
    expect(createTable).not.toMatch(/"tags_col"\s+text\s*(,|$)/m);
  });

  test('renders enum type identifiers quoted and schema-qualified', () => {
    const createTable = createTableOf(enumInSchemaTable);
    expect(createTable).toContain('"status_col" "ddl_test_schema"."ddl_test_status"');
    expect(createTable).not.toContain('ddl_test_schema.ddl_test_status"');
  });

  test('renders a schema-less enum quoted but unqualified', () => {
    const createTable = createTableOf(sourceTable);
    const moodLine = createTable.split('\n').find((line) => line.includes('"mood_col"'));
    expect(moodLine).toBeDefined();
    expect(moodLine).toContain('"mood_col" "ddl_test_mood"');
  });
});
