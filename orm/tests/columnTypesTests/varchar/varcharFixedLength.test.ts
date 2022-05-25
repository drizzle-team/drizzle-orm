/* eslint-disable max-len */
/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */
import { test, suite } from 'uvu';
import * as assert from 'uvu/assert';

import { DB, DbConnector, eq } from '../../../src';
import 'dotenv/config';
import { prepareTestSqlFromSchema } from '../../utils';
import AllVarcharsFixedLengthTable, * as schema2 from './to/allVarcharsFixedLengthTable';
import { allPositiveFieldsLength, requiredFieldsLength } from './models';
import AllVarcharUtils from './utils';
import { defaultVarchar } from './to/allVarcharsTable';

interface Context {
  db?: DB;
  allVarcharsFixedLengthTable?: AllVarcharsFixedLengthTable;
}

const AllVarcharsFixedLengthSuite = suite<Context>('AllVarcharsFixedLengthSuite', {
  db: undefined,
  allVarcharsFixedLengthTable: undefined,
});

AllVarcharsFixedLengthSuite.before(async (context) => {
  try {
    const db = await new DbConnector()
      .params({
        database: process.env.POSTGRES_DB,
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT),
        password: process.env.POSTGRES_PASSWORD,
        user: 'postgres',
      })
      .connect();

    context.db = db;
    context.allVarcharsFixedLengthTable = new AllVarcharsFixedLengthTable(db);

    const sql = await prepareTestSqlFromSchema(schema2);

    await db.session().execute(sql);
  } catch (e) {
    console.log(e);
  }
});

AllVarcharsFixedLengthSuite('Insert all fields to table', async (context) => {
  const allVarcharsFixedLengthTable = context.allVarcharsFixedLengthTable!;
  const insertedValues = await allVarcharsFixedLengthTable.insert(allPositiveFieldsLength).all();
  const fullSelectResponse = await allVarcharsFixedLengthTable.select().all();

  assert.equal(insertedValues.length, 1, 'Length match');
  // DRI-23 assert.equal(insertedValues, [allPositiveFieldsLength], 'Insert all positive fields match');
  // DRI-23 assert.equal(fullSelectResponse, [allPositiveFieldsLength], 'Full select response match');

  const partialSelectResponse = await allVarcharsFixedLengthTable
    .select({
      simpleVarcharLength: allVarcharsFixedLengthTable.simpleVarcharLength,
      notNullVarcharLength: allVarcharsFixedLengthTable.notNullVarcharLength,
    })
    .all();

  assert.equal(partialSelectResponse.length, 1, 'Length match1');
  assert.equal(partialSelectResponse[0].notNullVarcharLength, allPositiveFieldsLength.notNullVarcharLength, 'Partial select work');
  assert.equal(partialSelectResponse[0].simpleVarcharLength, allPositiveFieldsLength.simpleVarcharLength, 'Partial select work');
  assert.type(partialSelectResponse[0].simpleVarcharLength, 'string', 'Type match');
  assert.type(partialSelectResponse[0].notNullVarcharLength, 'string', 'Type match');
});

AllVarcharsFixedLengthSuite('Insert all fields to table execute', async (context) => {
  const allVarcharsFixedLengthTable = context.allVarcharsFixedLengthTable!;

  await allVarcharsFixedLengthTable.insert(allPositiveFieldsLength).execute();
  const fullSelectResponse = await allVarcharsFixedLengthTable.select().all();

  assert.equal(fullSelectResponse.length, 1, 'Length match');
  // DRI-23 assert.equal(fullSelectResponse, [allPositiveFieldsLength], 'Insert all positive fields match');
  // DRI-23 assert.equal(fullSelectResponse, [allPositiveFieldsLength], 'Full select response match');

  const partialSelectResponse = await allVarcharsFixedLengthTable
    .select({
      simpleVarcharLength: allVarcharsFixedLengthTable.simpleVarcharLength,
      notNullVarcharLength: allVarcharsFixedLengthTable.notNullVarcharLength,
    })
    .all();

  assert.equal(partialSelectResponse.length, 1, 'Length match1');
  assert.equal(partialSelectResponse[0].notNullVarcharLength, allPositiveFieldsLength.notNullVarcharLength, 'Partial select work');
  assert.equal(partialSelectResponse[0].simpleVarcharLength, allPositiveFieldsLength.simpleVarcharLength, 'Partial select work');
  assert.type(partialSelectResponse[0].notNullVarcharLength, 'string', 'Type match');
});

AllVarcharsFixedLengthSuite('Insert all required fields to table', async (context) => {
  const allVarcharsTableFixedLength = context.allVarcharsFixedLengthTable!;

  const insertedValues = await allVarcharsTableFixedLength.insert(requiredFieldsLength).all();

  assert.ok(insertedValues, 'Got response');
  assert.is(insertedValues.length, 1, 'Length match');
  // DRI-16
  // assert.equal(insertedValues, [{ ...requiredFieldsLength, simpleVarcharLength: undefined, varcharWithDefaultLength: defaultVarchar }], 'optional strings is undefined');

  const fullSelectResponse = await allVarcharsTableFixedLength.select().all();

  assert.ok(fullSelectResponse, 'Got response');
  assert.is(fullSelectResponse.length, 1, 'Length match');
  // DRI-16
  // assert.equal(fullSelectResponse, [{ ...requiredFieldsLength, simpleVarcharLength: undefined, varcharWithDefaultLength: defaultVarchar }], 'matches original');
});

AllVarcharsFixedLengthSuite('Insert all required fields to table execute', async (context) => {
  const allVarcharsFixedLengthTable = context.allVarcharsFixedLengthTable!;
  console.log(requiredFieldsLength);

  await allVarcharsFixedLengthTable.insert(requiredFieldsLength).execute();
  const fullSelectResponse = await allVarcharsFixedLengthTable.select().all();
  console.log(fullSelectResponse);

  assert.ok(fullSelectResponse, 'Got response');
  assert.is(fullSelectResponse.length, 1, 'Length match');
  // DRI-16
  // assert.equal(insertedValues, [{ ...requiredFields, simpleVarchar: undefined,
  //  varcharWithDefault: defaultVarchar }],
  //  'optional strings is undefined');

  const partialSelectResponse = await allVarcharsFixedLengthTable.select({
    notNullVarcharLength: allVarcharsFixedLengthTable.notNullVarcharLength,
    varcharWithDefaultLength: allVarcharsFixedLengthTable.varcharWithDefaultLength,
    simpleVarcharLength: allVarcharsFixedLengthTable.simpleVarcharLength,
  }).all();

  assert.is(partialSelectResponse.length, 1, 'length match');
  assert.type(partialSelectResponse[0].notNullVarcharLength, 'string', 'type match');
  assert.is(partialSelectResponse[0].notNullVarcharLength, requiredFieldsLength.notNullVarcharLength, 'field match');
  assert.is(partialSelectResponse[0].varcharWithDefaultLength, requiredFieldsLength.varcharWithDefaultLength, 'fieldMatch');
  assert.ok(partialSelectResponse[0].simpleVarcharLength!.split('').length > 10, 'check string length');
  // DRI-16
  // assert.is(partialSelectResponse[0].varcharWithDefault, defaultVarchar);

  const partialSelect2Response = await allVarcharsFixedLengthTable.select({
    notNullUniqueVarcharLength: allVarcharsFixedLengthTable.notNullUniqueVarcharLength,
    primaryVarchar: allVarcharsFixedLengthTable.primaryVarcharLength,
  }).all();

  // DRI-23 assert.type(partialSelect2Response[0].notNullUniqueVarcharLength, 'string', 'Has property and property type match');
  assert.type(partialSelect2Response[0].primaryVarchar, 'string', 'Has property and property type match 2');
});

AllVarcharsFixedLengthSuite('InsertMany with same model for all inserted values', async (context) => {
  const allVarcharsTable = context.allVarcharsFixedLengthTable!;

  const varcharFixedLengthTableObjects = AllVarcharUtils.createAllVarcharsFixedLengthTableObjects(5);

  const insertManyResult = await allVarcharsTable
    .insertMany(varcharFixedLengthTableObjects).all();

  assert.is(insertManyResult.length, 5);
  // DRI-23 assert.equal(insertManyResult, varcharFixedLengthTableObjects);
});

AllVarcharsFixedLengthSuite('insertMany with same model for all inserted values execute', async (context) => {
  const allVarcharsTable = context.allVarcharsFixedLengthTable!;

  const varcharFixedLengthTableObjects = AllVarcharUtils.createAllVarcharsFixedLengthTableObjects(5);

  await allVarcharsTable
    .insertMany(varcharFixedLengthTableObjects).execute();

  const selectResult = await allVarcharsTable.select().all();

  assert.is(selectResult.length, 5);
  // DRI-23 assert.equal(selectResult, varcharFixedLengthTableObjects);
});

AllVarcharsFixedLengthSuite('Insert with onConflict statement on each field, that has such possibility(upsert)', async (context) => {
  const allVarcharsTable = context.allVarcharsFixedLengthTable!;

  await allVarcharsTable.insert(allPositiveFieldsLength).execute();

  const update = AllVarcharUtils.generateString(7);

  const result = await allVarcharsTable.insert(allPositiveFieldsLength)
    .onConflict((table) => table.primaryVarcharLengthIndex, { uniqueVarcharLength: update }).findOne();

  allPositiveFieldsLength.uniqueVarcharLength = update;

  // DRI-23 assert.equal(result, allPositiveFieldsLength, '1');

  const result1 = await allVarcharsTable.insert(allPositiveFieldsLength)
    .onConflict((table) => table.primaryVarcharLengthIndex, { uniqueVarcharLength: update }).findOne();

  allPositiveFieldsLength.uniqueVarcharLength = update;

  // DRI-23 assert.equal(result1, allPositiveFieldsLength, '2');

  const result2 = await allVarcharsTable.insert(allPositiveFieldsLength)
    .onConflict((table) => table.primaryVarcharLengthIndex, { notNullUniqueVarcharLength: update })
    .findOne();

  allPositiveFieldsLength.notNullUniqueVarcharLength = update;

  // DRI-23 assert.equal(result2, allPositiveFieldsLength, '3');

  const result3 = await allVarcharsTable.insert(allPositiveFieldsLength)
    .onConflict((table) => table.primaryVarcharLengthIndex, { primaryVarcharLength: update })
    .findOne();

  allPositiveFieldsLength.primaryVarcharLength = update;

  // DRI-23 assert.equal(result3, allPositiveFieldsLength, '4');

  const result4 = await allVarcharsTable.insert(allPositiveFieldsLength)
    .onConflict((table) => table.primaryVarcharLengthIndex, { varcharWithDefaultLength: update })
    .findOne();

  allPositiveFieldsLength.varcharWithDefaultLength = update;

  // DRI-23 assert.equal(result4, allPositiveFieldsLength, '5');
});

AllVarcharsFixedLengthSuite('Insert with onConflict statement on each field, that has such possibility(upsert) (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsFixedLengthTable!;

  await allVarcharsTable.insert(allPositiveFieldsLength).execute();

  const unique = AllVarcharUtils.generateString(7);

  await allVarcharsTable.insert(allPositiveFieldsLength)
    .onConflict((table) => table.primaryVarcharLengthIndex, { uniqueVarcharLength: unique }).execute();
  const selectResult = await allVarcharsTable.select().all();

  allPositiveFieldsLength.uniqueVarcharLength = unique;

  // DRI-23 assert.equal(selectResult[0], allPositiveFieldsLength);
});

AllVarcharsFixedLengthSuite('Insert long string to field with fixed length', async (context) => {
  const allVarcharsFixedLengthTable = context.allVarcharsFixedLengthTable!;

  try {
    const objWithSameUniqueKey = AllVarcharUtils.createAllVarcharsTableFixedLengthObject();
    objWithSameUniqueKey.notNullUniqueVarcharLength = AllVarcharUtils.generateString(100);

    await allVarcharsFixedLengthTable.insert(objWithSameUniqueKey).all();
    assert.unreachable('1. Insert long string - should have an excpetion');
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      assert.ok(err);
    }
  }
});

AllVarcharsFixedLengthSuite('Update with long string', async (context) => {
  const allVarcharsTableFixedLengthTable = context.allVarcharsFixedLengthTable!;
  await allVarcharsTableFixedLengthTable.insert(allPositiveFieldsLength).execute();

  allPositiveFieldsLength.notNullUniqueVarcharLength = AllVarcharUtils.generateString(100);

  try {
    await allVarcharsTableFixedLengthTable.update().set(allPositiveFieldsLength).execute();
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      assert.ok(err);
    }
  }
});

AllVarcharsFixedLengthSuite.after.each(async (context) => {
  await context.db!.session().execute(`TRUNCATE ${context.allVarcharsFixedLengthTable!.tableName()}`);
});

AllVarcharsFixedLengthSuite.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.allVarcharsFixedLengthTable!.tableName()}`);
  await context.db!.session().closeConnection();
});

AllVarcharsFixedLengthSuite.run();
