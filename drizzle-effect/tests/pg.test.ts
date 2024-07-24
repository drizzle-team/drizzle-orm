import { Schema } from '@effect/schema';
import {
  char,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { Either } from 'effect';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema } from '../src/index.ts';
import { expectSchemaShape } from './utils.ts';

export const roleEnum = pgEnum('role', ['admin', 'user']);

const emailRegex = /[^ @]+@[^ .@]+\.[^ .@]+/;

const users = pgTable('users', {
  a: integer('a').array(),
  id: serial('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull(),
  birthdayString: date('birthday_string').notNull(),
  birthdayDate: date('birthday_date', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  role: roleEnum('role').notNull(),
  roleText: text('role1', { enum: ['admin', 'user'] }).notNull(),
  roleText2: text('role2', { enum: ['admin', 'user'] })
    .notNull()
    .default('user'),
  profession: varchar('profession', { length: 20 }).notNull(),
  initials: char('initials', { length: 2 }).notNull(),
});

const testUser = {
  a: [1, 2, 3],
  id: 1,
  name: 'John Doe',
  email: 'john.doe@example.com',
  birthdayString: '1990-01-01',
  birthdayDate: new Date('1990-01-01'),
  createdAt: new Date(),
  role: 'admin' as const,
  roleText: 'admin' as const,
  roleText2: 'admin' as const,
  profession: 'Software Engineer',
  initials: 'JD',
};

test('is an instance of `Schema.Struct`', () => {
  const schema = createInsertSchema(users).pick('role', 'initials');

  const decode = Schema.decodeEither(schema);

  expect(Either.isRight(decode(testUser))).toBeTruthy();
  expect(
    Either.isRight(decode({ initials: 'AM', role: 'admin' })),
  ).toBeTruthy();

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

test('users insert invalid varchar', () => {
  const schema = createInsertSchema(users);

  expect(
    Either.isRight(
      Schema.decodeUnknownEither(schema)({
        ...testUser,
        profession: 'Chief Executive Officer',
      }),
    ),
  ).toBeFalsy();
});

test('users insert invalid char', () => {
  const schema = createInsertSchema(users);

  expect(
    Either.isRight(
      Schema.decodeUnknownEither(schema)({ ...testUser, initials: 'JoDo' }),
    ),
  ).toBeFalsy();
});

test('users insert schema', (t) => {
  const actual = createInsertSchema(users, {
    id: ({ id }) => id.pipe(Schema.positive()),
    email: ({ email }) => email.pipe(Schema.pattern(emailRegex)),
    roleText: Schema.Literal('user', 'manager', 'admin'),
  });

  () => {
    {
      createInsertSchema(users, {
        // @ts-expect-error (missing property)
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
    a: Schema.optional(Schema.NullOr(Schema.Array(Schema.Number))),
    id: Schema.optional(Schema.Number.pipe(Schema.positive())),
    name: Schema.optional(Schema.NullOr(Schema.String)),
    email: Schema.String.pipe(Schema.pattern(emailRegex)),
    birthdayString: Schema.String,
    birthdayDate: Schema.DateFromSelf,
    createdAt: Schema.optional(Schema.DateFromSelf),
    role: Schema.Literal('admin', 'user'),
    roleText: Schema.Literal('user', 'manager', 'admin'),
    roleText2: Schema.optional(Schema.Literal('admin', 'user')),
    profession: Schema.String.pipe(Schema.maxLength(20)),
    initials: Schema.String.pipe(Schema.maxLength(2)),
  });

  expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
  const actual = createInsertSchema(users);

  const expected = Schema.Struct({
    a: Schema.optional(Schema.NullOr(Schema.Array(Schema.Number))),
    id: Schema.optional(Schema.Number),
    name: Schema.optional(Schema.NullOr(Schema.String)),
    email: Schema.String,
    birthdayString: Schema.String,
    birthdayDate: Schema.DateFromSelf,
    createdAt: Schema.optional(Schema.DateFromSelf),
    role: Schema.Literal('admin', 'user'),
    roleText: Schema.Literal('admin', 'user'),
    roleText2: Schema.optional(Schema.Literal('admin', 'user')),
    profession: Schema.String.pipe(Schema.maxLength(20)),
    initials: Schema.String.pipe(Schema.maxLength(2)),
  });

  expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
  const actual = createSelectSchema(users);

  const expected = Schema.Struct({
    a: Schema.NullOr(Schema.Array(Schema.Number)),
    id: Schema.Number,
    name: Schema.NullOr(Schema.String),
    email: Schema.String,
    birthdayString: Schema.String,
    birthdayDate: Schema.DateFromSelf,
    createdAt: Schema.DateFromSelf,
    role: Schema.Literal('admin', 'user'),
    roleText: Schema.Literal('admin', 'user'),
    roleText2: Schema.Literal('admin', 'user'),
    profession: Schema.String.pipe(Schema.maxLength(20)),
    initials: Schema.String.pipe(Schema.maxLength(2)),
  });

  expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
  const actual = createSelectSchema(users, {
    id: ({ id }) => id.pipe(Schema.positive()),
    email: ({ email }) => email.pipe(Schema.pattern(emailRegex)),
    roleText: Schema.Literal('user', 'manager', 'admin'),
  });

  const expected = Schema.Struct({
    a: Schema.NullOr(Schema.Array(Schema.Number)),
    id: Schema.Number.pipe(Schema.positive()),
    name: Schema.NullOr(Schema.String),
    email: Schema.String.pipe(Schema.pattern(emailRegex)),
    birthdayString: Schema.String,
    birthdayDate: Schema.DateFromSelf,
    createdAt: Schema.DateFromSelf,
    role: Schema.Literal('admin', 'user'),
    roleText: Schema.Literal('user', 'manager', 'admin'),
    roleText2: Schema.Literal('admin', 'user'),
    profession: Schema.String.pipe(Schema.maxLength(20)),
    initials: Schema.String.pipe(Schema.maxLength(2)),
  });

  expectSchemaShape(t, expected).from(actual);
});
