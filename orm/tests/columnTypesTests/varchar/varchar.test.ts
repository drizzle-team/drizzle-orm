/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */
import { test, suite } from 'uvu';
import * as assert from 'uvu/assert';

import { DB, DbConnector, eq } from '../../../src';
import 'dotenv/config';
import { prepareTestSqlFromSchema } from '../../utils';
import AllVarcharsTable, * as schema from './to/allVarcharsTable';
import AllVarcharsFixedLengthTable, * as schema2 from './to/allVarcharsFixedLengthTable';
import { allPositiveFields, allPositiveFieldsLength, requiredFields } from './models';
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

AllVarcharsSuite('Insert all fields to table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const insertedValues = await allVarcharsTable.insert(allPositiveFields).all();
  const fullSelectResponse = await allVarcharsTable.select().all();

  assert.equal(insertedValues.length, 1, 'Length match');
  assert.equal(insertedValues, [allPositiveFields], 'Insert all positive fields match');
  assert.equal(fullSelectResponse, [allPositiveFields], 'Full select response match');

  const partialSelectResponse = await allVarcharsTable
    .select({
      simpleVarchar: allVarcharsTable.simpleVarchar,
      notNullVarchar: allVarcharsTable.notNullVarchar,
    })
    .all();

  assert.equal(partialSelectResponse.length, 1, 'Length match1');
  assert.equal(partialSelectResponse[0].simpleVarchar, allPositiveFields.simpleVarchar, 'Partial select work');
  assert.type(partialSelectResponse[0].simpleVarchar, 'string', 'Type match');
  assert.type(partialSelectResponse[0].notNullVarchar, 'string', 'Type match');
});

AllVarcharsSuite('Insert all fields to table execute', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  await allVarcharsTable.insert(allPositiveFields).execute();
  const fullSelectResponse = await allVarcharsTable.select().all();

  assert.equal(fullSelectResponse.length, 1, 'Length match');
  assert.equal(fullSelectResponse, [allPositiveFields], 'Insert all positive fields match');
  assert.equal(fullSelectResponse, [allPositiveFields], 'Full select response match');

  const partialSelectResponse = await allVarcharsTable
    .select({
      // simpleVarcharLength: allVarcharsTable.simpleVarcharLength,
      simpleVarchar: allVarcharsTable.simpleVarchar,
      notNullVarcharLength: allVarcharsTable.notNullVarchar,
    })
    .all();

  assert.equal(partialSelectResponse.length, 1, 'Length match1');
  assert.equal(partialSelectResponse[0].notNullVarcharLength, allPositiveFields.notNullVarchar, 'Partial select work');
  assert.equal(partialSelectResponse[0].simpleVarchar, allPositiveFields.simpleVarchar, 'Partial select work');
  assert.type(partialSelectResponse[0].notNullVarcharLength, 'string', 'Type match');
  assert.type(partialSelectResponse[0].simpleVarchar, 'string', 'Type match');
});

AllVarcharsSuite('Insert all required fields to table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const insertedValues = await allVarcharsTable.insert(requiredFields).all();

  assert.ok(insertedValues, 'Got response');
  assert.is(insertedValues.length, 1, 'Length match');
  // DRI-16
  // assert.equal(insertedValues, [{ ...requiredFields, simpleVarchar: undefined,
  //  varcharWithDefault: defaultVarchar }],
  //  'optional strings is undefined');

  const fullSelectResponse = await allVarcharsTable.select().all();

  assert.ok(fullSelectResponse, 'Got response');
  assert.is(fullSelectResponse.length, 1, 'Length match');
  // DRI-16
  // assert.equal(fullSelectResponse,
  //  [allPositiveFields, { ...requiredFields,
  //  simpleVarchar: undefined, varcharWithDefault: defaultVarchar }],
  //  'matches original');
});

AllVarcharsSuite('Insert all required fields to table execute', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  await allVarcharsTable.insert(requiredFields).execute();
  const fullSelectResponse = await allVarcharsTable.select().all();

  assert.ok(fullSelectResponse, 'Got response');
  assert.is(fullSelectResponse.length, 1, 'Length match');
  // DRI-16
  // assert.equal(insertedValues, [{ ...requiredFields, simpleVarchar: undefined,
  //  varcharWithDefault: defaultVarchar }],
  //  'optional strings is undefined');

  const partialSelectResponse = await allVarcharsTable.select({
    notNullVarchar: allVarcharsTable.notNullVarchar,
    varcharWithDefault: allVarcharsTable.varcharWithDefault,
    // varcharWithDefaultLength: allVarcharsTable.varcharWithDefaultLength,
    // simpleVarcharLength: allVarcharsTable.simpleVarcharLength,
  }).all();

  assert.is(partialSelectResponse.length, 1);
  assert.type(partialSelectResponse[0].notNullVarchar, 'string', 'type match');
  assert.is(partialSelectResponse[0].notNullVarchar, requiredFields.notNullVarchar, 'field match');
  // DRI-16
  // assert.is(partialSelectResponse.filter((it) => it.notNullVarchar === 'owner')[0]
  // .varcharWithDefault, defaultVarchar);
  // assert.is(partialSelectResponse
  // .filter((it) => it.notNullVarchar === 'Oleksii')[0]
  // .varcharWithDefault, defaultVarchar);

  const partialSelect2Response = await allVarcharsTable.select({
    notNullUniqueVarchar: allVarcharsTable.notNullUniqueVarchar,
    primaryVarchar: allVarcharsTable.primaryVarchar,
  }).all();

  assert.type(partialSelect2Response[0].notNullUniqueVarchar, 'string', 'Has property and property type match');
  assert.type(partialSelect2Response[0].primaryVarchar, 'string', 'Has property and property type match 2');
});

AllVarcharsSuite('insertMany with same model for all inserted values', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const varcharTableObjects = AllVarcharUtils.createAllVarcharsTableObjects(5);

  const insertManyResult = await allVarcharsTable
    .insertMany(varcharTableObjects).all();

  assert.is(insertManyResult.length, 5);
  assert.equal(insertManyResult, varcharTableObjects);
});

AllVarcharsSuite('insertMany with same model for all inserted values execute', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  const varcharTableObjects = AllVarcharUtils.createAllVarcharsTableObjects(5);

  await allVarcharsTable
    .insertMany(varcharTableObjects).execute();

  const selectResult = await allVarcharsTable.select().all();

  assert.is(selectResult.length, 5);
  assert.equal(selectResult, varcharTableObjects);
});

AllVarcharsSuite('Insert with onConflict statement on each field, that has such possibility(upsert)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  await allVarcharsTable.insert(allPositiveFields).execute();

  const update = AllVarcharUtils.generateString(7);

  const result = await allVarcharsTable.insert(allPositiveFields)
    .onConflict((table) => table.primaryVarcharIndex, { uniqueVarchar: update }).findOne();

  allPositiveFields.uniqueVarchar = update;

  assert.equal(result, allPositiveFields);

  const result1 = await allVarcharsTable.insert(allPositiveFields)
    .onConflict((table) => table.primaryVarcharIndex, { uniqueVarchar: update }).findOne();

  allPositiveFields.uniqueVarchar = update;

  assert.equal(result1, allPositiveFields);

  const result2 = await allVarcharsTable.insert(allPositiveFields)
    .onConflict((table) => table.primaryVarcharIndex, { notNullUniqueVarchar: update })
    .findOne();

  allPositiveFields.notNullUniqueVarchar = update;

  assert.equal(result2, allPositiveFields);

  const result3 = await allVarcharsTable.insert(allPositiveFields)
    .onConflict((table) => table.primaryVarcharIndex, { primaryVarchar: update })
    .findOne();

  allPositiveFields.primaryVarchar = update;

  assert.equal(result3, allPositiveFields);

  const result4 = await allVarcharsTable.insert(allPositiveFields)
    .onConflict((table) => table.primaryVarcharIndex, { varcharWithDefault: update })
    .findOne();

  allPositiveFields.varcharWithDefault = update;

  assert.equal(result4, allPositiveFields);
});

AllVarcharsSuite('Insert with onConflict statement on each field, that has such possibility(upsert) (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  await allVarcharsTable.insert(allPositiveFields).execute();

  const unique = AllVarcharUtils.generateString(7);

  await allVarcharsTable.insert(allPositiveFields)
    .onConflict((table) => table.primaryVarcharIndex, { uniqueVarchar: unique }).execute();
  const selectResult = await allVarcharsTable.select().all();

  allPositiveFields.uniqueVarchar = unique;

  assert.equal(selectResult[0], allPositiveFields);
});

AllVarcharsSuite('Delete rows by each field values', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

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
  assert.is(deleteResult4[0].uniqueVarchar, allPositiveFields.uniqueVarchar, 'Deleted object is right3');
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

AllVarcharsSuite('Delete rows by each field values (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

  await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .execute();

  const selectResult = await allVarcharsTable.select().all();

  assert.is(selectResult.length, 0, 'Length match');

  await allVarcharsTable.insert(allPositiveFields).execute();

  await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.notNullVarchar, allPositiveFields.notNullVarchar))
    .execute();

  const selectResult1 = await allVarcharsTable.select().all();
  assert.is(selectResult1.length, 0, 'Length match1');

  await allVarcharsTable.insert(allPositiveFields).execute();

  await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.simpleVarchar, allPositiveFields.simpleVarchar!))
    .execute();

  const selectResult2 = await allVarcharsTable.select().all();
  assert.is(selectResult2.length, 0, 'Length match2');

  await allVarcharsTable.insert(allPositiveFields).execute();

  await allVarcharsTable
    .delete()
    .where(eq(allVarcharsTable.uniqueVarchar, allPositiveFields.uniqueVarchar!))
    .execute();

  const selectResult3 = await allVarcharsTable.select().all();

  assert.is(selectResult3.length, 0, 'Length match3');
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
// // Exeption cases

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

AllVarcharsSuite('Insert with wrong type', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  try {
    const objWithSameUniqueKey = AllVarcharUtils.createAllVarcharsTableObject();
    objWithSameUniqueKey.notNullUniqueVarchar = Math.random() as unknown as string;

    await allVarcharsTable.insert(objWithSameUniqueKey).all();
    assert.unreachable('1. Insert with wrong type should have an excpetion');
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      assert.ok(err);
    }
  }
});

AllVarcharsSuite('Insert with same unique key - should have an excpetion (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  try {
    const objWithSameUniqueKey = AllVarcharUtils.createAllVarcharsTableObject();
    objWithSameUniqueKey.notNullUniqueVarchar = allPositiveFields.notNullUniqueVarchar;

    await allVarcharsTable.insert(objWithSameUniqueKey).execute();
    assert.unreachable('1. Insert with same unique key - should have an excpetion (execute)');
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

AllVarcharsSuite('Insert with same primary key - should have an excpetion (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  try {
    const objWithSamePrimaryKey = AllVarcharUtils.createAllVarcharsTableObject();
    objWithSamePrimaryKey.primaryVarchar = allPositiveFields.primaryVarchar;

    await allVarcharsTable.insert(objWithSamePrimaryKey).execute();
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
  await allVarcharsTable.insert(allPositiveFields).execute();

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

AllVarcharsSuite('Update all fields from table (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

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
  await allVarcharsTable.insert(allPositiveFields).execute();

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

AllVarcharsSuite('Update 1 by 1 field from table (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

  const update = AllVarcharUtils.createAllVarcharsTableObject();

  await allVarcharsTable
    .update()
    .set({ notNullVarchar: update.notNullVarchar })
    .execute();
  const selectResultNotNullVarchar = await allVarcharsTable.select().all();
  await allVarcharsTable
    .update()
    .set({ simpleVarchar: update.simpleVarchar })
    .execute();
  const selectResultSimpleVarchar = await allVarcharsTable.select().all();
  await allVarcharsTable
    .update()
    .set({ notNullVarcharWithDefault: update.notNullVarcharWithDefault })
    .execute();
  const selectResultNotNullVarcharWithDefault = await allVarcharsTable.select().all();

  allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set({ uniqueVarchar: update.uniqueVarchar })
    .findOne();
  const selectResultUniqueVarchar = await allVarcharsTable.select().all();

  await allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set({ notNullUniqueVarchar: update.notNullUniqueVarchar })
    .findOne();
  const selectResultNotNullUniqueVarchar = await allVarcharsTable.select().all();

  assert.is(selectResultNotNullVarchar[0].notNullVarchar, update.notNullVarchar, 'notNullVarchar');
  assert.is(selectResultSimpleVarchar[0].simpleVarchar, update.simpleVarchar, 'simpleVarchar');
  assert.is(selectResultNotNullVarcharWithDefault[0].notNullVarcharWithDefault,
    update.notNullVarcharWithDefault, 'notNullVarcharWithDefault');
  assert.is(selectResultUniqueVarchar[0].uniqueVarchar, update.uniqueVarchar, 'uniqueVarchar');
  assert.is(selectResultNotNullUniqueVarchar[0].notNullUniqueVarchar, update.notNullUniqueVarchar, 'notNullUniqueVarchar');
});

AllVarcharsSuite('Update batches of several fields from table', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

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
    .all();

  assert.is(batch2Result[0].simpleVarchar, batch.simpleVarchar, 'simpleVarchar work2');
  assert.is(batch2Result[0].notNullVarcharWithDefault, batch.notNullVarcharWithDefault, 'notNullVarcharWithDefault work2');
  assert.is(batch2Result[0].uniqueVarchar, batch.uniqueVarchar, 'uniqueVarchar2');
});

AllVarcharsSuite('Update batches of several fields from table (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

  const updateObject = AllVarcharUtils.createAllVarcharsTableObject();
  const batch: Partial<schema.AllVarcharsTableModel> = {
    simpleVarchar: updateObject.simpleVarchar,
    notNullVarcharWithDefault: updateObject.notNullVarcharWithDefault,
    uniqueVarchar: updateObject.uniqueVarchar,
  };

  await allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set(batch)
    .execute();

  const selectResultBatch = await allVarcharsTable.select().all();

  assert.is(selectResultBatch[0].simpleVarchar, batch.simpleVarchar, 'simpleVarchar work');
  assert.is(selectResultBatch[0].notNullVarcharWithDefault, batch.notNullVarcharWithDefault, 'notNullVarcharWithDefault work');
  assert.is(selectResultBatch[0].uniqueVarchar, batch.uniqueVarchar, 'uniqueVarchar');
  assert.type(selectResultBatch[0].uniqueVarchar, 'string');

  const batch1: Partial<schema.AllVarcharsTableModel> = {
    varcharWithDefault: updateObject.varcharWithDefault,
    notNullVarchar: updateObject.notNullVarchar,
  };

  await allVarcharsTable
    .update()
    .where(eq(allVarcharsTable.primaryVarchar, allPositiveFields.primaryVarchar))
    .set(batch1)
    .execute();

  const selectResultBatch1 = await allVarcharsTable.select().all();

  assert.is(selectResultBatch1[0].simpleVarchar, batch.simpleVarchar, 'simpleVarchar work2');
  assert.is(selectResultBatch1[0].notNullVarcharWithDefault, batch.notNullVarcharWithDefault, 'notNullVarcharWithDefault work2');
  assert.is(selectResultBatch1[0].uniqueVarchar, batch.uniqueVarchar, 'uniqueVarchar2');
  assert.type(selectResultBatch1[0].uniqueVarchar, 'string');
});

AllVarcharsSuite('Update with same unique key - should have an excpetion', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

  try {
    await allVarcharsTable.update().set(allPositiveFields).all();
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      assert.ok(err, 'Update with same unique key - should have an excpetion (all)');
    }
  }

  try {
    await allVarcharsTable.update().set(allPositiveFields).findOne();
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      assert.ok(err, 'Update with same unique key - should have an excpetion (findOne)');
    }
  }
});

AllVarcharsSuite('Update with same unique key - should have an excpetion (execute)', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;
  await allVarcharsTable.insert(allPositiveFields).execute();

  try {
    await allVarcharsTable.update().set(allPositiveFields).execute();
  } catch (err: unknown) {
    assert.instance(err, Error);
    if (err instanceof Error) {
      assert.ok(err);
    }
  }
});

AllVarcharsSuite.after.each(async (context) => {
  await context.db!.session().execute(`TRUNCATE ${context.allVarcharsTable!.tableName()}`);
});

AllVarcharsSuite.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.allVarcharsTable!.tableName()}`);
  await context.db!.session().closeConnection();
});

AllVarcharsSuite.run();
