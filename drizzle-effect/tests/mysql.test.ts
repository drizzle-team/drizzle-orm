import { Schema } from '@effect/schema';
import {
  bigint,
  binary,
  boolean,
  char,
  customType,
  date,
  datetime,
  decimal,
  double,
  float,
  int,
  json,
  longtext,
  mediumint,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  real,
  serial,
  smallint,
  text,
  time,
  timestamp,
  tinyint,
  tinytext,
  varbinary,
  varchar,
  year,
} from 'drizzle-orm/mysql-core';
import { Either } from 'effect';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema, Json } from '../src/index.ts';
import { expectSchemaShape } from './utils.ts';

const customInt = customType<{ data: number }>({
  dataType() {
    return 'int';
  },
});

const testTable = mysqlTable('test', {
  bigint: bigint('bigint', { mode: 'bigint' }).notNull(),
  bigintNumber: bigint('bigintNumber', { mode: 'number' }).notNull(),
  binary: binary('binary').notNull(),
  boolean: boolean('boolean').notNull(),
  char: char('char', { length: 4 }).notNull(),
  charEnum: char('char', { enum: ['a', 'b', 'c'] }).notNull(),
  customInt: customInt('customInt').notNull(),
  date: date('date').notNull(),
  dateString: date('dateString', { mode: 'string' }).notNull(),
  datetime: datetime('datetime').notNull(),
  datetimeString: datetime('datetimeString', { mode: 'string' }).notNull(),
  decimal: decimal('decimal').notNull(),
  double: double('double').notNull(),
  enum: mysqlEnum('enum', ['a', 'b', 'c']).notNull(),
  float: float('float').notNull(),
  int: int('int').notNull(),
  json: json('json').notNull(),
  mediumint: mediumint('mediumint').notNull(),
  real: real('real').notNull(),
  serial: serial('serial').notNull(),
  smallint: smallint('smallint').notNull(),
  text: text('text').notNull(),
  textEnum: text('textEnum', { enum: ['a', 'b', 'c'] }).notNull(),
  tinytext: tinytext('tinytext').notNull(),
  tinytextEnum: tinytext('tinytextEnum', { enum: ['a', 'b', 'c'] }).notNull(),
  mediumtext: mediumtext('mediumtext').notNull(),
  mediumtextEnum: mediumtext('mediumtextEnum', {
    enum: ['a', 'b', 'c'],
  }).notNull(),
  longtext: longtext('longtext').notNull(),
  longtextEnum: longtext('longtextEnum', { enum: ['a', 'b', 'c'] }).notNull(),
  time: time('time').notNull(),
  timestamp: timestamp('timestamp').notNull(),
  timestampString: timestamp('timestampString', { mode: 'string' }).notNull(),
  tinyint: tinyint('tinyint').notNull(),
  varbinary: varbinary('varbinary', { length: 200 }).notNull(),
  varchar: varchar('varchar', { length: 200 }).notNull(),
  varcharEnum: varchar('varcharEnum', {
    length: 1,
    enum: ['a', 'b', 'c'],
  }).notNull(),
  year: year('year').notNull(),
  autoIncrement: int('autoIncrement').notNull().autoincrement(),
});

const testTableRow = {
  bigint: BigInt(1),
  bigintNumber: 1,
  binary: 'binary',
  boolean: true,
  char: 'char',
  charEnum: 'a' as const,
  customInt: { data: 1 },
  date: new Date(),
  dateString: new Date().toISOString(),
  datetime: new Date(),
  datetimeString: new Date().toISOString(),
  decimal: '1.1',
  double: 1.1,
  enum: 'a' as const,
  float: 1.1,
  int: 1,
  json: { data: 1 },
  mediumint: 1,
  real: 1.1,
  serial: 1,
  smallint: 1,
  text: 'text',
  textEnum: 'a' as const,
  tinytext: 'tinytext',
  tinytextEnum: 'a' as const,
  mediumtext: 'mediumtext',
  mediumtextEnum: 'a' as const,
  longtext: 'longtext',
  longtextEnum: 'a' as const,
  time: '00:00:00',
  timestamp: new Date(),
  timestampString: new Date().toISOString(),
  tinyint: 1,
  varbinary: 'A'.repeat(200),
  varchar: 'A'.repeat(200),
  varcharEnum: 'a' as const,
  year: 2021,
  autoIncrement: 1,
};

test('is an instance of `Schema.Struct`', () => {
  const schema = createInsertSchema(testTable).pick('boolean', 'varcharEnum');

  const decode = Schema.decodeEither(schema);

  expect(Either.isRight(decode(testTableRow))).toBeTruthy();
  expect(
    Either.isRight(decode({ boolean: false, varcharEnum: 'a' })),
  ).toBeTruthy();

  expect(Either.isRight(Schema.decodeUnknownEither(schema)({}))).toBeFalsy();
  expect(
    Either.isRight(
      decode(testTableRow, {
        onExcessProperty: 'error',
      }),
    ),
  ).toBeFalsy();
});

test('insert valid row', () => {
  const schema = createInsertSchema(testTable);

  const result = Schema.decodeEither(schema)(testTableRow);

  expect(Either.isRight(result)).toBeTruthy();
});

test('insert invalid varchar length', () => {
  const schema = createInsertSchema(testTable);

  const result = Schema.decodeEither(schema)({
    ...testTableRow,
    varchar: 'A'.repeat(201),
  });
  expect(Either.isRight(result)).toBeFalsy();
});

test('insert smaller char length should work', () => {
  const schema = createInsertSchema(testTable);
  const result = Schema.decodeEither(schema)({ ...testTableRow, char: 'abc' });

  expect(Either.isRight(result)).toBeTruthy();
});

test('insert larger char length should fail', () => {
  const schema = createInsertSchema(testTable);
  const result = Schema.decodeEither(schema)({
    ...testTableRow,
    char: 'abcde',
  });

  expect(Either.isRight(result)).toBeFalsy();
});

test('insert schema', (t) => {
  const actual = createInsertSchema(testTable);

  const expected = Schema.Struct({
    bigint: Schema.BigIntFromSelf,
    bigintNumber: Schema.Number,
    binary: Schema.String,
    boolean: Schema.Boolean,
    char: Schema.String.pipe(Schema.maxLength(4)),
    charEnum: Schema.Literal('a', 'b', 'c'),
    customInt: Schema.Any,
    date: Schema.DateFromSelf,
    dateString: Schema.String,
    datetime: Schema.DateFromSelf,
    datetimeString: Schema.String,
    decimal: Schema.String,
    double: Schema.Number,
    enum: Schema.Literal('a', 'b', 'c'),
    float: Schema.Number,
    int: Schema.Number,
    json: Json,
    mediumint: Schema.Number,
    real: Schema.Number,
    serial: Schema.optional(Schema.Number),
    smallint: Schema.Number,
    text: Schema.String,
    textEnum: Schema.Literal('a', 'b', 'c'),
    tinytext: Schema.String,
    tinytextEnum: Schema.Literal('a', 'b', 'c'),
    mediumtext: Schema.String,
    mediumtextEnum: Schema.Literal('a', 'b', 'c'),
    longtext: Schema.String,
    longtextEnum: Schema.Literal('a', 'b', 'c'),
    time: Schema.String,
    timestamp: Schema.DateFromSelf,
    timestampString: Schema.String,
    tinyint: Schema.Number,
    varbinary: Schema.String.pipe(Schema.maxLength(200)),
    varchar: Schema.String.pipe(Schema.maxLength(200)),
    varcharEnum: Schema.Literal('a', 'b', 'c'),
    year: Schema.Number,
    autoIncrement: Schema.optional(Schema.Number),
  });

  expectSchemaShape(t, expected).from(actual);
});

test('select schema', (t) => {
  const actual = createSelectSchema(testTable);

  const expected = Schema.Struct({
    bigint: Schema.BigIntFromSelf,
    bigintNumber: Schema.Number,
    binary: Schema.String,
    boolean: Schema.Boolean,
    char: Schema.String.pipe(Schema.maxLength(4)),
    charEnum: Schema.Literal('a', 'b', 'c'),
    customInt: Schema.Any,
    date: Schema.DateFromSelf,
    dateString: Schema.String,
    datetime: Schema.DateFromSelf,
    datetimeString: Schema.String,
    decimal: Schema.String,
    double: Schema.Number,
    enum: Schema.Literal('a', 'b', 'c'),
    float: Schema.Number,
    int: Schema.Number,
    json: Json,
    mediumint: Schema.Number,
    real: Schema.Number,
    serial: Schema.Number,
    smallint: Schema.Number,
    text: Schema.String,
    textEnum: Schema.Literal('a', 'b', 'c'),
    tinytext: Schema.String,
    tinytextEnum: Schema.Literal('a', 'b', 'c'),
    mediumtext: Schema.String,
    mediumtextEnum: Schema.Literal('a', 'b', 'c'),
    longtext: Schema.String,
    longtextEnum: Schema.Literal('a', 'b', 'c'),
    time: Schema.String,
    timestamp: Schema.DateFromSelf,
    timestampString: Schema.String,
    tinyint: Schema.Number,
    varbinary: Schema.String.pipe(Schema.maxLength(200)),
    varchar: Schema.String.pipe(Schema.maxLength(200)),
    varcharEnum: Schema.Literal('a', 'b', 'c'),
    year: Schema.Number,
    autoIncrement: Schema.Number,
  });

  expectSchemaShape(t, expected).from(actual);
});

test('select schema w/ refine', (t) => {
  const actual = createSelectSchema(testTable, {
    bigint: (schema) => schema.bigint.pipe(Schema.positiveBigInt()),
  });

  const expected = Schema.Struct({
    bigint: Schema.BigIntFromSelf.pipe(Schema.positiveBigInt()),
    bigintNumber: Schema.Number,
    binary: Schema.String,
    boolean: Schema.Boolean,
    char: Schema.String.pipe(Schema.maxLength(4)),
    charEnum: Schema.Literal('a', 'b', 'c'),
    customInt: Schema.Any,
    date: Schema.DateFromSelf,
    dateString: Schema.String,
    datetime: Schema.DateFromSelf,
    datetimeString: Schema.String,
    decimal: Schema.String,
    double: Schema.Number,
    enum: Schema.Literal('a', 'b', 'c'),
    float: Schema.Number,
    int: Schema.Number,
    json: Json,
    mediumint: Schema.Number,
    real: Schema.Number,
    serial: Schema.Number,
    smallint: Schema.Number,
    text: Schema.String,
    textEnum: Schema.Literal('a', 'b', 'c'),
    tinytext: Schema.String,
    tinytextEnum: Schema.Literal('a', 'b', 'c'),
    mediumtext: Schema.String,
    mediumtextEnum: Schema.Literal('a', 'b', 'c'),
    longtext: Schema.String,
    longtextEnum: Schema.Literal('a', 'b', 'c'),
    time: Schema.String,
    timestamp: Schema.DateFromSelf,
    timestampString: Schema.String,
    tinyint: Schema.Number,
    varbinary: Schema.String.pipe(Schema.maxLength(200)),
    varchar: Schema.String.pipe(Schema.maxLength(200)),
    varcharEnum: Schema.Literal('a', 'b', 'c'),
    year: Schema.Number,
    autoIncrement: Schema.Number,
  });

  expectSchemaShape(t, expected).from(actual);
});
