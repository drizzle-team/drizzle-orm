/* eslint-disable import/no-extraneous-dependencies */
import { test, suite } from 'uvu';
import * as assert from 'uvu/assert';

import {
  DB, DbConnector, eq, ExtractModel, set,
} from '../../../src';
import 'dotenv/config';
import { prepareTestSqlFromSchema } from '../../utils';
import AllIntsTable, * as schema from './to/allIntsTable';
import { allPositiveFields, mixedFields } from './models';

interface Context {
  db?: DB;
  allIntsTable?: AllIntsTable;
}

const AllIntsSuite = suite<Context>('AllIntsSuite', {
  db: undefined,
  allIntsTable: undefined,
});

AllIntsSuite.before(async (context) => {
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
    context.allIntsTable = new AllIntsTable(db);

    const sql = await prepareTestSqlFromSchema(schema);

    console.log(sql);

    await db.session().execute(sql);
  } catch (e) {
    console.log(e);
  }
});

// Success cases
// Flow
// 1. insert by <strategy>
//  -> 2.select and check expected values (full + several partial selects)
//      -> 3. update by <strategy>
//          -> 4. select and check expected values (full + several partial selects)
//              -> 5. delete by <strategy>
//                  -> 6. select and check expected values (full + several partial selects)

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
// 3. Insert float instead of int - should have an excpetion
// 4. OnConflict was used by unexisting index - should have an exception

// Update cases
// 1. Update with same unique key - should have an excpetion
// 2. Update with same primary key - should have an excpetion
// 3. Update to float instead of int - should have an excpetion

// Delete cases

// Select cases

AllIntsSuite('Insert1 -> Update1 -> Delete1', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();

  const insertedValues = await allIntsTable.insert(mixedFields).all();

  // assert insertedValues has all expected values
  const fullSelectResponse = await allIntsTable.select().all();
  // assert table has all expected values inserted
  const partialSelectResponse = await allIntsTable.select({
    notNullInt: allIntsTable.notNullInt,
    intWithDefault: allIntsTable.intWithDefault,
  }).all();

  assert.is(insertedValues.length, 1);
  assert.equal(insertedValues[0], mixedFields);

  assert.is(fullSelectResponse.length, 2);
  assert.equal(fullSelectResponse.filter((it) => it.serialInt === allPositiveFields.serialInt)[0],
    allPositiveFields);
  assert.equal(fullSelectResponse.filter((it) => it.serialInt === mixedFields.serialInt)[0],
    mixedFields);

  assert.is(partialSelectResponse.length, 2);
  assert.is(partialSelectResponse.filter(
    (it) => it.notNullInt === allPositiveFields.notNullInt)[0].intWithDefault,
  allPositiveFields.intWithDefault);
  assert.is(partialSelectResponse.filter(
    (it) => it.notNullInt === mixedFields.notNullInt)[0].intWithDefault,
  mixedFields.intWithDefault);

  // exception cases
  const doublePrimaryInt = { ...allPositiveFields };
  try {
    await allIntsTable.insert(doublePrimaryInt).execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(err.message, 'duplicate key value violates unique constraint "table_with_all_ints_pkey"');
  }

  const doubleUniqueInt = { ...allPositiveFields };
  doubleUniqueInt.primaryInt = 1;
  doubleUniqueInt.notNullUniqueInt = 1;

  try {
    await allIntsTable.insert(doubleUniqueInt).execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(err.message, 'duplicate key value violates unique constraint "table_with_all_ints_unique_int_index"');
  }

  const addFloat = { ...doubleUniqueInt };
  addFloat.primaryInt = 123;
  addFloat.uniqueInt = 257;
  addFloat.notNullUniqueInt = 467;
  addFloat.simpleInt = 15.25;

  try {
    await allIntsTable.insert(addFloat).execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(err.message, 'invalid input syntax for type integer: "15.25"');
  }


  // try {
  //   await allIntsTable.insert(allPositiveFields).onConflict(
  //     (table) => table.phoneIndex,
  //     { phone: 'confilctUpdate' },
  //   ).all();
  //   assert.unreachable('should have thrown');
  // } catch (err) {
  //   assert.is(err.message, 'invalid input syntax for type integer: "15.25"');
  // }


  // update by 1 strategy
  // logic
  const updatePositiveFields:ExtractModel<AllIntsTable> = {
    primaryInt: 9,
    serialInt: 8,
    simpleInt: 7,
    notNullInt: 6,
    intWithDefault: 5,
    notNullIntWithDefault: 4,
    uniqueInt: 3,
    notNullUniqueInt: 2,
  };
  const updateMixedFields:ExtractModel<AllIntsTable> = {
    primaryInt: -5,
    serialInt: 14,
    simpleInt: -1,
    notNullInt: 7,
    intWithDefault: 2,
    notNullIntWithDefault: 16,
    uniqueInt: -7,
    notNullUniqueInt: -2,
  };

  await allIntsTable.update()
    .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
    .set(updatePositiveFields).execute();

  const updatedValues = await allIntsTable.update()
    .where(eq(allIntsTable.serialInt, mixedFields.serialInt!))
    .set(updateMixedFields).all();

  const fullSelectUpdate = await allIntsTable.select().all();

  const partialSelectUpdate = await allIntsTable.select({
    uniqueInt: allIntsTable.uniqueInt,
    notNullUniqueInt: allIntsTable.notNullUniqueInt,
  }).all();

  assert.is(updatedValues.length, 1);
  assert.equal(updatedValues[0], updateMixedFields);

  assert.is(fullSelectUpdate.length, 2);
  assert.equal(fullSelectUpdate.filter((it) => it.serialInt === updatePositiveFields.serialInt)[0],
    updatePositiveFields);
  assert.equal(fullSelectUpdate.filter((it) => it.serialInt === updateMixedFields.serialInt)[0],
    updateMixedFields);

  assert.is(partialSelectUpdate.length, 2);
  assert.is(partialSelectUpdate.filter(
    (it) => it.uniqueInt === updatePositiveFields.uniqueInt)[0].notNullUniqueInt,
  updatePositiveFields.notNullUniqueInt);
  assert.is(partialSelectUpdate.filter(
    (it) => it.uniqueInt === updateMixedFields.uniqueInt)[0].notNullUniqueInt,
  updateMixedFields.notNullUniqueInt);

 // exception cases
  const doublePrimaryIntUpdate = { ...updatePositiveFields };
  doublePrimaryIntUpdate.primaryInt = updateMixedFields.primaryInt;
  // 
  try {
    await allIntsTable.update()
      .where(eq(allIntsTable.serialInt, updatePositiveFields.serialInt!))
      .set(doublePrimaryIntUpdate).execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(err.message, 'duplicate key value violates unique constraint "table_with_all_ints_pkey"');
  }


  const doubleUniqueIntUpdate = { ...updatePositiveFields };
  doubleUniqueIntUpdate.uniqueInt = updateMixedFields.uniqueInt;
  try {
    await allIntsTable.update()
      .where(eq(allIntsTable.serialInt, updatePositiveFields.serialInt!))
      .set(doubleUniqueIntUpdate)
      .execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(err.message, 'duplicate key value violates unique constraint "table_with_all_ints_unique_int_index"');
  }

  const addFloatUpdate = { ...updatePositiveFields };
  addFloatUpdate.simpleInt = 15.25;

  try {
    const result = await allIntsTable.update()
      .where(eq(allIntsTable.serialInt, updatePositiveFields.serialInt!))
      .set(addFloatUpdate)
      .execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(err.message, 'invalid input syntax for type integer: "15.25"');
  }

  // delete by 1 strategy

  const fieldsIntsTable = [
    allIntsTable.primaryInt,
    allIntsTable.serialInt,
    allIntsTable.simpleInt,
    allIntsTable.notNullInt,
    allIntsTable.intWithDefault,
    allIntsTable.notNullIntWithDefault,
    allIntsTable.uniqueInt,
    allIntsTable.notNullUniqueInt,
  ];

  const updatePositiveFieldsValues = Object.values(updatePositiveFields);
  const updateMixedFieldsValues = Object.values(updateMixedFields);
  let index = 0;

  for (const fieldIntsTable of fieldsIntsTable) {
    await allIntsTable.delete()
      .where(eq(fieldIntsTable, updatePositiveFieldsValues[index]))
      .execute();

    const partialSelectDelete = await allIntsTable.select({
      primaryInt: allIntsTable.primaryInt,
      simpleInt: allIntsTable.simpleInt,
    }).all();

    const deleteValue = await allIntsTable.delete()
      .where(eq(fieldIntsTable, updateMixedFieldsValues[index]))
      .all();

    const fullSelectDelete = await allIntsTable.select().all();

    assert.is(deleteValue.length, 1);
    assert.equal(deleteValue[0], updateMixedFields);

    assert.is(partialSelectDelete.length, 1);
    assert.is(partialSelectDelete.filter(
      (it) => it.primaryInt === updateMixedFields.primaryInt)[0].simpleInt,
    updateMixedFields.simpleInt);
    assert.not(partialSelectDelete.filter(
      (it) => it.primaryInt === updatePositiveFields.primaryInt)[0]);

    assert.is(fullSelectDelete.length, 0);
    assert.not(fullSelectDelete.filter((it) => it.serialInt === updatePositiveFields.serialInt)[0]);
    assert.not(fullSelectDelete.filter((it) => it.serialInt === updateMixedFields.serialInt)[0]);

    await allIntsTable.insert(updatePositiveFields).execute();
    await allIntsTable.insert(updateMixedFields).execute();
    index += 1;
  }
});

// if needed
// AllIntsSuite.after.each(async (context) => {
//   await context.db!.session().execute(`TRUNCATE ${context.allIntsTable!.tableName()}`);
// });

AllIntsSuite.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.allIntsTable!.tableName()}`);
  await context.db!.session().closeConnection();
});

AllIntsSuite.run();
