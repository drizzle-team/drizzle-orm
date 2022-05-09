/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */
import { test, suite } from 'uvu';
import * as assert from 'uvu/assert';

import { DB, DbConnector } from '../../../src';
import 'dotenv/config';
import { prepareTestSqlFromSchema } from '../../utils';
import AllVarcharsTable, * as schema from './to/allVarcharsTable';
import { allPositiveFields } from './models';

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

AllVarcharsSuite('Insert1 -> Update1 -> Delete1', async (context) => {
  const allVarcharsTable = context.allVarcharsTable!;

  await allVarcharsTable.insert(allPositiveFields).execute();

  const insertedValues = await allVarcharsTable.insert(mixedFields).all();

  // assert insertedValues has all expected values
  const fullSelectResponse = await allVarcharsTable.select().all();
  // assert table has all expected values inserted
  const partialSelectResponse = await allVarcharsTable.select({
    notNullVarchar: allVarcharsTable.notNullVarchar,
    varcharWithDefault: allVarcharsTable.varcharWithDefault,
  }).all();

  assert.is(fullSelectResponse.length, 1);
  assert.is(partialSelectResponse.length, 1);
//   assert.is(partialSelectResponse.filter((it) => it.notNullVarchar === 0)[0].varcharWithDefault, -1);

  // update by 1 strategy
  // logic

  // same select
  // assert insertedValues has all expected values
  //   const fullSelectResponse = await allIntsTable.select().all();
  //   // assert table has all expected values inserted
  //   const partialSelectResponse = await allIntsTable.select({
  //     notNullInt: allIntsTable.notNullInt,
  //     intWithDefault: allIntsTable.intWithDefault,
  //   }).all();

  //   assert.is(fullSelectResponse.length, 2);
  //   assert.is(partialSelectResponse.length, 2);
  //   assert.is(partialSelectResponse.filter((it) => it.notNullInt === 0)[0].intWithDefault, -1);

  // delete by 1 strategy

  // same select
  // assert insertedValues has all expected values
  //   const fullSelectResponse = await allIntsTable.select().all();
  //   // assert table has all expected values inserted
  //   const partialSelectResponse = await allIntsTable.select({
  //     notNullInt: allIntsTable.notNullInt,
  //     intWithDefault: allIntsTable.intWithDefault,
  //   }).all();

  //   assert.is(fullSelectResponse.length, 2);
  //   assert.is(partialSelectResponse.length, 2);
  //   assert.is(partialSelectResponse.filter((it) => it.notNullInt === 0)[0].intWithDefault, -1);
});

// if needed
// AllIntsSuite.after.each(async (context) => {
//   await context.db!.session().execute(`TRUNCATE ${context.allIntsTable!.tableName()}`);
// });

AllVarcharsSuite.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.allVarcharsTable!.tableName()}`);
  await context.db!.session().closeConnection();
});

AllVarcharsSuite.run();
