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

// Update cases
// 1. Update with same unique key - should have an excpetion
// 2. Update with same primary key - should have an excpetion
// 3. Update to float instead of int - should have an excpetion

AllVarcharsSuite('Insert all fields to table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const insertedValues = await allVarcharsTable.insert(allPositiveFields).all();
  const fullSelectResponse = await allVarcharsTable.select().all();

  assert.equal(insertedValues.length, 1, 'Length match');
  assert.equal(insertedValues, [allPositiveFields], 'Insert all positive fields match');
  assert.equal(fullSelectResponse, [allPositiveFields], 'Full select response match');
});

AllVarcharsSuite('Insert all required fields to table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const insertedValues = await allVarcharsTable.insert(requiredFields).all();

  assert.ok(insertedValues, 'Got response');
  assert.is(insertedValues.length, 1, 'Length match');
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

  const varcharTableObjects = AllVarcharUtils.createAllVarcharsTableObjects(5);

  const insertManyResult = allVarcharsTable
    .insertMany(varcharTableObjects) as unknown as {_values: object[]};

  assert.is(insertManyResult._values.length, 5);
  assert.is(insertManyResult._values, varcharTableObjects);
});

AllVarcharsSuite('Insert with onConflict statement on each field, that has such possibility(upsert)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const unique = AllVarcharUtils.generateString(7);

  const result = await allVarcharsTable.insert(allPositiveFields)
    .onConflict((table) => table.primaryVarcharIndex, { uniqueVarchar: unique }).findOne();

  allPositiveFields.uniqueVarchar = unique;

  assert.equal(result, allPositiveFields);
});

AllVarcharsSuite('Delete rows by each field values', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const deleteResult = await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .all();

  assert.is(deleteResult.length, 1, 'Length match');
  assert.is(deleteResult[0].primaryVarchar, allPositiveFields.primaryVarchar, 'Deleted object is right');

  await allVarcharsTable.insert(allPositiveFields).execute();

  const deleteResult2 = await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.notNullVarchar, allPositiveFields.notNullVarchar))
    .all();

  assert.is(deleteResult2.length, 1, 'Length match2');
  assert.is(deleteResult2[0].notNullVarchar, allPositiveFields.notNullVarchar, 'Deleted object is right 2');

  await allVarcharsTable.insert(allPositiveFields).execute();

  const deleteResult3 = await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.simpleVarchar, allPositiveFields.simpleVarchar!))
    .all();

  assert.is(deleteResult3.length, 1, 'Length match3');
  assert.is(deleteResult3[0].simpleVarchar, allPositiveFields.simpleVarchar, 'Deleted object is right3');

  await allVarcharsTable.insert(allPositiveFields).execute();

  const deleteResult4 = await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.uniqueVarchar, allPositiveFields.uniqueVarchar!))
    .all();

  assert.is(deleteResult4.length, 1, 'Length match3');
  assert.is(deleteResult4[0].simpleVarchar, allPositiveFields.simpleVarchar, 'Deleted object is right3');
  try {
    await allVarcharsTable
      .select()
      .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
      .findOne();
  } catch (err) {
    assert.ok(err, 'Fail to select deleted object');
    assert.instance(err, Error, 'Error is type of error');
  }
});
// Exeption cases

AllVarcharsSuite('Insert with same unique key - should have an excpetion', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  try {
    const objWithSameUniqueKey = AllVarcharUtils.createAllVarcharsTableObject();
    objWithSameUniqueKey.notNullUniqueVarchar = allPositiveFields.notNullUniqueVarchar;

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
    const objWithSamePrimaryKey = AllVarcharUtils.createAllVarcharsTableObject();
    objWithSamePrimaryKey.primaryVarchar = allPositiveFields.primaryVarchar;

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

  const updateAllFields = AllVarcharUtils
    .createAllVarcharsTableObject() as Partial<schema.AllVarcharsTableModel>;
  delete updateAllFields.primaryVarchar;

  const updateResultAllFields = await allVarcharsTable.update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set(updateAllFields)
    .findOne();

  updateAllFields.primaryVarchar = allPositiveFields.primaryVarchar;

  assert.equal(updateResultAllFields, updateAllFields);
});

AllVarcharsSuite('Update 1 by 1 field from table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const update = AllVarcharUtils.createAllVarcharsTableObject();

  const updateResultNotNullVarchar = await allVarcharsTable
    .update()
    .set({ notNullVarchar: update.notNullVarchar })
    .all();
  const updateResultSimpleVarchar = await allVarcharsTable
    .update()
    .set({ simpleVarchar: update.simpleVarchar })
    .all();
  const updateResultVarcharWithDefault = await allVarcharsTable
    .update()
    .set({ notNullVarcharWithDefault: update.notNullVarcharWithDefault })
    .all();
  const updateResultUniqueVarchar = await allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set({ uniqueVarchar: update.uniqueVarchar })
    .findOne();
  const updateNotNullUniqueVarchar = await allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set({ notNullUniqueVarchar: update.notNullUniqueVarchar })
    .findOne();

  assert.is(updateResultNotNullVarchar[0].notNullVarchar, update.notNullVarchar, 'notNullVarchar');
  assert.is(updateResultSimpleVarchar[0].simpleVarchar, update.simpleVarchar, 'simpleVarchar');
  assert.is(updateResultVarcharWithDefault[0].notNullVarcharWithDefault,
    update.notNullVarcharWithDefault, 'notNullVarcharWithDefault');
  assert.is(updateResultUniqueVarchar.uniqueVarchar, update.uniqueVarchar, 'uniqueVarchar');
  assert.is(updateNotNullUniqueVarchar.notNullUniqueVarchar, update.notNullUniqueVarchar, 'notNullUniqueVarchar');
});

AllVarcharsSuite('Update batches of several fields from table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const updateObject = AllVarcharUtils.createAllVarcharsTableObject();
  const batch: Partial<schema.AllVarcharsTableModel> = {
    simpleVarchar: updateObject.simpleVarchar,
    notNullVarcharWithDefault: updateObject.notNullVarcharWithDefault,
    uniqueVarchar: updateObject.uniqueVarchar,
  };

  const batch1Result = await allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set(batch)
    .findOne();

  assert.is(batch1Result.simpleVarchar, batch.simpleVarchar, 'simpleVarchar work');
  assert.is(batch1Result.notNullVarcharWithDefault, batch.notNullVarcharWithDefault, 'notNullVarcharWithDefault work');
  assert.is(batch1Result.uniqueVarchar, batch.uniqueVarchar, 'uniqueVarchar');

  const batch1: Partial<schema.AllVarcharsTableModel> = {
    varcharWithDefault: updateObject.varcharWithDefault,
    notNullVarchar: updateObject.notNullVarchar,
  };

  const batch2Result = await allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set(batch1)
    .findOne();

  assert.is(batch2Result.simpleVarchar, batch.simpleVarchar, 'simpleVarchar work2');
  assert.is(batch2Result.notNullVarcharWithDefault, batch.notNullVarcharWithDefault, 'notNullVarcharWithDefault work2');
  assert.is(batch2Result.uniqueVarchar, batch.uniqueVarchar, 'uniqueVarchar2');
});

AllVarcharsSuite('Update with same unique key - should have an excpetion', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  try {
    await allVarcharsTable.update().set(allPositiveFields).execute();
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      assert.ok(err);
    }
  }
});

AllVarcharsSuite.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.allVarcharsTable!.tableName()}`);
  await context.db!.session().closeConnection();
});

AllVarcharsSuite.run();
