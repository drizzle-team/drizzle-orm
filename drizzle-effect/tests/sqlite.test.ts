import { Schema } from '@effect/schema';
import {
  blob,
  integer,
  numeric,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { Either } from 'effect';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema, Json } from '../src/index.ts';
import { expectSchemaShape } from './utils.ts';

const blobJsonSchema = Schema.Struct({
  foo: Schema.String,
});

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  boolean: integer('boolean', { mode: 'boolean' }).notNull(),
  blobJson: blob('blob', { mode: 'json' })
    .$type<Schema.Schema.Type<typeof blobJsonSchema>>()
    .notNull(),
  blobBigInt: blob('blob', { mode: 'bigint' }).notNull(),

  numeric: numeric('numeric').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }).notNull(),
  real: real('real').notNull(),
  text: text('text', { length: 255 }),
  role: text('role', { enum: ['admin', 'user'] })
    .notNull()
    .default('user'),
});

const testUser = {
  id: 1,
  blobJson: { foo: 'bar' },
  blobBigInt: BigInt(123),
  numeric: '123.45',
  createdAt: new Date(),
  createdAtMs: new Date(),
  boolean: true,
  real: 123.45,
  text: 'foobar',
  role: 'admin' as const,
};

test('is an instance of `Schema.Struct`', () => {
  const schema = createInsertSchema(users).pick('role', 'boolean');

  const decode = Schema.decodeEither(schema);

  expect(Either.isRight(decode(testUser))).toBeTruthy();
  expect(Either.isRight(decode({ boolean: false, role: 'user' }))).toBeTruthy();

  expect(Either.isRight(Schema.decodeUnknownEither(schema)({}))).toBeFalsy();
  expect(
    Either.isRight(
      decode(testUser, {
        onExcessProperty: 'error',
      }),
    ),
  ).toBeFalsy();
});

test('users insert valid user', () => {
  const schema = createInsertSchema(users);

  const result = Schema.decodeEither(schema)(testUser);

  expect(Either.isRight(result)).toBeTruthy();
});

test('users insert invalid text length', () => {
  const schema = createInsertSchema(users);

  const result = Schema.decodeEither(schema)({
    ...testUser,
    text: 'a'.repeat(256),
  });

  expect(Either.isRight(result)).toBeFalsy();
});

test('users insert schema', (t) => {
  const actual = createInsertSchema(users, {
    id: ({ id }) => id.pipe(Schema.positive()),
    blobJson: blobJsonSchema,
    role: Schema.Literal('admin', 'manager', 'user'),
  });

  () => {
    {
      createInsertSchema(users, {
        // @ts-expect-error (unknown property)
        foobar: Schema.Number,
      });
    }

    {
      createInsertSchema(users, {
        // @ts-expect-error (invalid type)
        id: 123,
      });
    }
  };

  const expected = Schema.Struct({
    id: Schema.optional(Schema.Number.pipe(Schema.positive())),
    blobJson: blobJsonSchema,
    blobBigInt: Schema.BigIntFromSelf,
    numeric: Schema.String,
    createdAt: Schema.DateFromSelf,
    createdAtMs: Schema.DateFromSelf,
    boolean: Schema.Boolean,
    real: Schema.Number,
    text: Schema.optional(
      Schema.NullOr(Schema.String.pipe(Schema.maxLength(255))),
    ),
    role: Schema.optional(Schema.Literal('admin', 'manager', 'user')),
  });

  expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
  const actual = createInsertSchema(users);

  const expected = Schema.Struct({
    id: Schema.optional(Schema.Number),
    blobJson: Json,
    blobBigInt: Schema.BigIntFromSelf,
    numeric: Schema.String,
    createdAt: Schema.DateFromSelf,
    createdAtMs: Schema.DateFromSelf,
    boolean: Schema.Boolean,
    real: Schema.Number,
    text: Schema.optional(
      Schema.NullOr(Schema.String.pipe(Schema.maxLength(255))),
    ),
    role: Schema.optional(Schema.Literal('admin', 'user')),
  });

  expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
  const actual = createSelectSchema(users);

  const expected = Schema.Struct({
    id: Schema.Number,
    blobJson: Json,
    blobBigInt: Schema.BigIntFromSelf,
    numeric: Schema.String,
    createdAt: Schema.DateFromSelf,
    createdAtMs: Schema.DateFromSelf,
    boolean: Schema.Boolean,
    real: Schema.Number,
    text: Schema.NullOr(Schema.String.pipe(Schema.maxLength(255))),
    role: Schema.Literal('admin', 'user'),
  });

  expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
  const actual = createSelectSchema(users, {
    blobJson: Json,
    role: Schema.Literal('admin', 'manager', 'user'),
  });

  () => {
    {
      createSelectSchema(users, {
        // @ts-expect-error (missing property)
        foobar: z.number(),
      });
    }

    {
      createSelectSchema(users, {
        // @ts-expect-error (invalid type)
        id: 123,
      });
    }
  };

  const expected = Schema.Struct({
    id: Schema.Number,
    blobJson: Json,
    blobBigInt: Schema.BigIntFromSelf,
    numeric: Schema.String,
    createdAt: Schema.DateFromSelf,
    createdAtMs: Schema.DateFromSelf,
    boolean: Schema.Boolean,
    real: Schema.Number,
    text: Schema.NullOr(Schema.String.pipe(Schema.maxLength(255))),
    role: Schema.Literal('admin', 'manager', 'user'),
  });

  expectSchemaShape(t, expected).from(actual);
});
