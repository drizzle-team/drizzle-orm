/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */
import { test, suite } from 'uvu';
import * as assert from 'uvu/assert';

import { DB, DbConnector, eq } from '../../../src';
import 'dotenv/config';
import { prepareTestSqlFromSchema } from '../../utils';
import AllVarcharsTable, * as schema from './to/allVarcharsTable';
import { allPositiveFields, mixedFields as requiredFields } from './models';
import AllVarcharUtils from './utils';

interface Context {
  db?: DB;
  allVarcharsTable?: AllVarcharsTable;
}

const AllVarcharsSuite = suite<Context>('AllVarcharsSuite', {
  db: undefined,
  allVarcharsTable: undefined,
});

AllVarcharsSuite.before(async (context) => {
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
    context.allVarcharsTable = new AllVarcharsTable(db);

    const sql = await prepareTestSqlFromSchema(schema);

    await db.session().execute(sql);
  } catch (e) {
    console.log(e);
  }
});

// Insert strategies (each insert should have all() + execute()
//      After using all() -> check that returned object fields are expected
// )
// 1. insert all fields to table;
// 2. insert all required fields to table;
// 3. insertMany with same model for all inserted values;
// 4. insertMany with different models for all inserted values;
// 5. insert with onConflict statement on each field, that has such possibility(upsert)

// Update strategies (each update should have all() + execute()
//      After using all() -> check that returned object fields are expected
// )
// 1. Update all fields from table;
// 2. Update 1 by 1 field from table;
// 3. Update batches of several fields from table(2-3 different batches will be enough);

// Delete strategies (each delete should have all() + execute()
//      After using all() -> check that returned object fields are expected
// )
// 1. Delete rows by each field values

// Exception cases
// Insert cases
// 1. Insert with same unique key - should have an excpetion
// 2. Insert with same primary key - should have an excpetion
// 3. OnConflict was used by unexisting index - should have an exception

// Update cases
// 1. Update with same unique key - should have an excpetion
// 2. Update with same primary key - should have an excpetion
// 3. Update to float instead of int - should have an excpetion

AllVarcharsSuite('Insert all fields to table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const insertedValues = await allVarcharsTable.insert(allPositiveFields).all();

  assert.equal(insertedValues, [allPositiveFields], 'Insert all positive fields match');

  const fullSelectResponse = await allVarcharsTable.select().all();

  assert.equal(fullSelectResponse, [allPositiveFields], 'Full select response match');
});

AllVarcharsSuite('Insert all required fields to table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const insertedValues = await allVarcharsTable.insert(requiredFields).all();
  // DRI-16
  // assert.equal(insertedValues, [{ ...requiredFields, simpleVarchar: undefined,
  //  varcharWithDefault: 'UA' }],
  //  'matches original optional strings is undefined');

  const fullSelectResponse = await allVarcharsTable.select().all();

  // DRI-16
  // assert.equal(fullSelectResponse,
  //  [allPositiveFields, { ...requiredFields,
  //  simpleVarchar: undefined, varcharWithDefault: 'UA' }],
  //  'matches original');
});

AllVarcharsSuite('Partial selects', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  // 1
  const partialSelectResponse = await allVarcharsTable.select({
    notNullVarchar: allVarcharsTable.notNullVarchar,
    varcharWithDefault: allVarcharsTable.varcharWithDefault,
  }).all();

  assert.type(partialSelectResponse[0].notNullVarchar, 'string');
  assert.is(partialSelectResponse.length, 2);
  assert.is(partialSelectResponse.filter((it) => it.notNullVarchar === 'owner')[0].varcharWithDefault, 'EN');
  // DRI-16
  // assert.is(partialSelectResponse
  // .filter((it) => it.notNullVarchar === 'Oleksii')[0]
  // .varcharWithDefault, 'UA');

  // 2
  const partialSelect2Response = await allVarcharsTable.select({
    simpleVarchar: allVarcharsTable.simpleVarchar,
    primaryVarchar: allVarcharsTable.primaryVarchar,
  }).all();

  assert.type(partialSelect2Response[0].simpleVarchar, 'string', 'Has property and property type match');
  assert.type(partialSelect2Response[0].primaryVarchar, 'string', 'Has property and property type match 2');
});

AllVarcharsSuite('insertMany with same model for all inserted values', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const varcharTableObjects = AllVarcharUtils.createAllVarcharsTableModels(5);

  const insertManyResult = allVarcharsTable.insertMany(varcharTableObjects);

  assert.is(insertManyResult._values.length, 5);
  assert.is(insertManyResult._values, varcharTableObjects);
});

// Exeption cases

AllVarcharsSuite('Insert with same unique key - should have an excpetion', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  try {
    const objWithSameUniqueKey = {
      primaryVarchar: 'exAmple3@gmail.com',
      simpleVarchar: 'Oleksii`s MacBook',
      notNullVarchar: 'owner',
      varcharWithDefault: 'EN',
      notNullVarcharWithDefault: 'MacBook M1',
      uniqueVarchar: 'C02FL29VQ6LR',
      notNullUniqueVarchar: 'CNNioewqj932JOIK<O)&^%',
    };
    await allVarcharsTable.insert(objWithSameUniqueKey).all();
    assert.unreachable('1. Insert with same unique key - should have an excpetion');
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      // DRI-15
      // assert.equal(
      // err.message,'duplicate key value violates unique constraint
      // "table_with_all_varchars_unique_varchar_index"',
      // 'Insert with same unique key - should have an excpetion');

      assert.ok(err);
    }
  }
});

AllVarcharsSuite('Insert with same primary key - should have an excpetion', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  try {
    const objWithSamePrimaryKey = {
      primaryVarchar: 'exAmple@gmail.com',
      simpleVarchar: 'Oleksii`s MacBook',
      notNullVarchar: 'owner',
      varcharWithDefault: 'EN',
      notNullVarcharWithDefault: 'MacBook M1',
      uniqueVarchar: 'C02FL29VQ6LRPM',
      notNullUniqueVarchar: 'CNNioewqj932JOIK<O)&^%',
    };
    await allVarcharsTable.insert(objWithSamePrimaryKey).all();
    assert.unreachable('should have throw an error');
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      // DRI-16
      // assert.match(err.message,
      //  'duplicate key value violates unique constraint "table_with_all_varchars_pkey"');
      assert.ok(err);
    }
  }
});

AllVarcharsSuite('Update all fields from table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const updateAllFields = {
    primaryVarchar: 'exAmpl3e@gmail.com',
    simpleVarchar: 'Oleksii`s Mac Book',
    notNullVarchar: 'owner ',
    varcharWithDefault: 'UA',
    notNullVarcharWithDefault: 'MacBook M1+',
    uniqueVarchar: 'C02FL29VLRPM',
    notNullUniqueVarchar: 'CNNoewqj932JOIK<O)&^%',
  };

  const updateResultAllFields = await allVarcharsTable.update()
    .where(eq(allVarcharsTable.primaryVarchar, 'exAmple@gmail.com'))
    .set(updateAllFields)
    .findOne();

  assert.equal(updateResultAllFields, updateAllFields);
});

AllVarcharsSuite('Update 1 by 1 field from table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  const update = {
    notNullVarchar: 'Kilevoi Oleksii M',
  };
  const updateResult = await allVarcharsTable.update().set(update).all();

  assert.is(updateResult[0].notNullVarchar, update.notNullVarchar);
  assert.is(updateResult.length, 2);

  await allVarcharsTable.update().set(update).execute();
});

AllVarcharsSuite.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.allVarcharsTable!.tableName()}`);
  await context.db!.session().closeConnection();
});

AllVarcharsSuite.run();
