/* eslint-disable import/no-extraneous-dependencies */
import 'dotenv/config';
import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import { DB, DbConnector, eq } from '../../../src';
import { prepareTestSqlFromSchema } from '../../utils';
import {
  allPositiveFields,
  differentMixedFields,
  differentPositiveFields,
  mixedFields,
  requiredMixedFields,
  requiredPositiveFields,
  updateMixedFields,
  updatePositiveFields,
} from './models';
import AllIntsTable, * as schema from './to/allIntsTable';

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

// Insert

AllIntsSuite('Insert all fields to table', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();
  const insertedValues = await allIntsTable.insert(mixedFields).all();

  const fullSelectResponse = await allIntsTable.select().all();
  const partialSelectResponse = await allIntsTable
    .select({
      notNullInt: allIntsTable.notNullInt,
      intWithDefault: allIntsTable.intWithDefault,
    })
    .all();

  assert.is(insertedValues.length, 1);
  assert.equal(insertedValues[0], mixedFields);

  assert.is(fullSelectResponse.length, 2);
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === allPositiveFields.serialInt)[0],
    allPositiveFields,
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === mixedFields.serialInt)[0],
    mixedFields,
  );

  assert.is(partialSelectResponse.length, 2);
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === allPositiveFields.notNullInt)[0]
      .intWithDefault,
    allPositiveFields.intWithDefault,
  );
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === mixedFields.notNullInt)[0]
      .intWithDefault,
    mixedFields.intWithDefault,
  );
});

AllIntsSuite('Insert all required fields to table', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(requiredPositiveFields).execute();
  const insertedValues = await allIntsTable.insert(requiredMixedFields).all();

  const fullSelectResponse = await allIntsTable.select().all();
  const partialSelectResponse = await allIntsTable
    .select({
      notNullInt: allIntsTable.notNullInt,
      notNullIntWithDefault: allIntsTable.notNullIntWithDefault,
      notNullUniqueInt: allIntsTable.notNullUniqueInt,
    })
    .all();

  assert.is(insertedValues.length, 1);
  assert.equal(insertedValues[0], {
    ...requiredMixedFields,
    serialInt: 2,
    intWithDefault: 1,
    uniqueInt: undefined,
    simpleInt: undefined,
  });

  assert.is(fullSelectResponse.length, 2);
  assert.equal(
    fullSelectResponse.filter((it) => it.primaryInt === requiredPositiveFields.primaryInt)[0],
    {
      ...requiredPositiveFields,
      serialInt: 1,
      intWithDefault: 1,
      uniqueInt: undefined,
      simpleInt: undefined,
    },
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.primaryInt === requiredMixedFields.primaryInt)[0],
    {
      ...requiredMixedFields,
      serialInt: 2,
      intWithDefault: 1,
      uniqueInt: undefined,
      simpleInt: undefined,
    },
  );

  assert.is(partialSelectResponse.length, 2);
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === requiredPositiveFields.notNullInt)[0]
      .notNullInt,
    requiredPositiveFields.notNullInt,
  );
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === requiredMixedFields.notNullInt)[0]
      .notNullInt,
    requiredMixedFields.notNullInt,
  );
});

AllIntsSuite('InsertMany with same model for all inserted values', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insertMany([allPositiveFields, mixedFields]).execute();
  const insertedValues = await allIntsTable
    .insertMany([updatePositiveFields, updateMixedFields])
    .all();

  const fullSelectResponse = await allIntsTable.select().all();
  const partialSelectResponse = await allIntsTable
    .select({
      notNullInt: allIntsTable.notNullInt,
      notNullIntWithDefault: allIntsTable.notNullIntWithDefault,
      notNullUniqueInt: allIntsTable.notNullUniqueInt,
    })
    .all();

  assert.is(insertedValues.length, 2);
  assert.equal(insertedValues[0], updatePositiveFields);
  assert.equal(insertedValues[1], updateMixedFields);

  assert.is(fullSelectResponse.length, 4);
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === allPositiveFields.serialInt)[0],
    allPositiveFields,
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === mixedFields.serialInt)[0],
    mixedFields,
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === updatePositiveFields.serialInt)[0],
    updatePositiveFields,
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === updateMixedFields.serialInt)[0],
    updateMixedFields,
  );

  assert.is(partialSelectResponse.length, 4);
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === allPositiveFields.notNullInt)[0]
      .notNullUniqueInt,
    allPositiveFields.notNullUniqueInt,
  );
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === mixedFields.notNullInt)[0]
      .notNullUniqueInt,
    mixedFields.notNullUniqueInt,
  );
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === updatePositiveFields.notNullInt)[0]
      .notNullUniqueInt,
    updatePositiveFields.notNullUniqueInt,
  );
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === updateMixedFields.notNullInt)[0]
      .notNullUniqueInt,
    updateMixedFields.notNullUniqueInt,
  );
});

AllIntsSuite('InsertMany with different models for all inserted values', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insertMany([allPositiveFields, differentPositiveFields]).execute();
  const insertedValues = await allIntsTable.insertMany([mixedFields, differentMixedFields]).all();

  const fullSelectResponse = await allIntsTable.select().all();
  const partialSelectResponse = await allIntsTable
    .select({
      notNullInt: allIntsTable.notNullInt,
      notNullIntWithDefault: allIntsTable.notNullIntWithDefault,
      notNullUniqueInt: allIntsTable.notNullUniqueInt,
    })
    .all();

  assert.is(insertedValues.length, 2);
  assert.equal(insertedValues[0], mixedFields);
  assert.equal(insertedValues[1], {
    ...differentMixedFields,
    intWithDefault: 1,
    uniqueInt: undefined,
    simpleInt: undefined,
  });

  assert.is(fullSelectResponse.length, 4);
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === allPositiveFields.serialInt)[0],
    allPositiveFields,
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.serialInt === mixedFields.serialInt)[0],
    mixedFields,
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.primaryInt === differentPositiveFields.primaryInt)[0],
    {
      ...differentPositiveFields,
      intWithDefault: 1,
      uniqueInt: undefined,
      simpleInt: undefined,
    },
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.primaryInt === differentMixedFields.primaryInt)[0],
    {
      ...differentMixedFields,
      intWithDefault: 1,
      uniqueInt: undefined,
      simpleInt: undefined,
    },
  );

  assert.is(partialSelectResponse.length, 4);
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === allPositiveFields.notNullInt)[0]
      .notNullUniqueInt,
    allPositiveFields.notNullUniqueInt,
  );
  assert.is(
    partialSelectResponse.filter((it) => it.notNullInt === mixedFields.notNullInt)[0]
      .notNullUniqueInt,
    mixedFields.notNullUniqueInt,
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.primaryInt === differentPositiveFields.primaryInt)[0],
    {
      ...differentPositiveFields,
      intWithDefault: 1,
      uniqueInt: undefined,
      simpleInt: undefined,
    },
  );
  assert.equal(
    fullSelectResponse.filter((it) => it.primaryInt === differentMixedFields.primaryInt)[0],
    {
      ...differentMixedFields,
      intWithDefault: 1,
      uniqueInt: undefined,
      simpleInt: undefined,
    },
  );
});

AllIntsSuite('Insert with onConflict statement', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();

  try {
    await allIntsTable
      .insertMany([allPositiveFields, updatePositiveFields])
      .onConflict((table) => table.simpleIntIndex, { simpleInt: 777 })
      .all();
  } catch (err) {
    assert.unreachable(err.message);
  }

  const select = await allIntsTable.select().all();

  assert.is(select.length, 2);
  assert.is(select.filter((it) => it.serialInt === allPositiveFields.serialInt)[0].simpleInt, 777);
});

// ticket DRI-17

// AllIntsSuite('Inserting an null value into a serial field', async (context) => {
//   const allIntsTable = context.allIntsTable!;

//   const undefinedSerial = { ...allPositiveFields, serialInt: undefined };
//   try {
//     await allIntsTable.insert(undefinedSerial).execute();
//   } catch (error) {
//     assert.unreachable(err.message);
//   }

//   const selectResponse = await allIntsTable.select().all();
//   assert.is(selectResponse.length, 1);
// });

// Update

AllIntsSuite('Update all fields from table', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();
  await allIntsTable.insert(mixedFields).execute();

  await allIntsTable
    .update()
    .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
    .set(updatePositiveFields)
    .execute();
  const updatedValues = await allIntsTable
    .update()
    .where(eq(allIntsTable.serialInt, mixedFields.serialInt!))
    .set(updateMixedFields)
    .all();

  const fullSelectUpdate = await allIntsTable.select().all();
  const partialSelectUpdate = await allIntsTable
    .select({
      uniqueInt: allIntsTable.uniqueInt,
      notNullUniqueInt: allIntsTable.notNullUniqueInt,
    })
    .all();

  assert.is(updatedValues.length, 1);
  assert.equal(updatedValues[0], updateMixedFields);

  assert.is(fullSelectUpdate.length, 2);
  assert.equal(
    fullSelectUpdate.filter((it) => it.serialInt === updatePositiveFields.serialInt)[0],
    updatePositiveFields,
  );
  assert.equal(
    fullSelectUpdate.filter((it) => it.serialInt === updateMixedFields.serialInt)[0],
    updateMixedFields,
  );

  assert.is(partialSelectUpdate.length, 2);
  assert.is(
    partialSelectUpdate.filter((it) => it.uniqueInt === updatePositiveFields.uniqueInt)[0]
      .notNullUniqueInt,
    updatePositiveFields.notNullUniqueInt,
  );
  assert.is(
    partialSelectUpdate.filter((it) => it.uniqueInt === updateMixedFields.uniqueInt)[0]
      .notNullUniqueInt,
    updateMixedFields.notNullUniqueInt,
  );
});

AllIntsSuite('Update 1 by 1 field from table', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();
  await allIntsTable.insert(mixedFields).execute();

  await allIntsTable
    .update()
    .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
    .set({ simpleInt: updatePositiveFields.simpleInt })
    .execute();
  const updatedValues = await allIntsTable
    .update()
    .where(eq(allIntsTable.serialInt, mixedFields.serialInt!))
    .set({ simpleInt: updateMixedFields.simpleInt })
    .all();

  const fullSelectUpdate = await allIntsTable.select().all();
  const partialSelectUpdate = await allIntsTable
    .select({
      uniqueInt: allIntsTable.uniqueInt,
      notNullUniqueInt: allIntsTable.notNullUniqueInt,
      simpleInt: allIntsTable.simpleInt,
    })
    .all();

  assert.is(updatedValues.length, 1);
  assert.equal(updatedValues[0], {
    ...mixedFields,
    simpleInt: updateMixedFields.simpleInt,
  });

  assert.is(fullSelectUpdate.length, 2);
  assert.equal(fullSelectUpdate.filter((it) => it.serialInt === allPositiveFields.serialInt)[0], {
    ...allPositiveFields,
    simpleInt: updatePositiveFields.simpleInt,
  });
  assert.equal(fullSelectUpdate.filter((it) => it.serialInt === mixedFields.serialInt)[0], {
    ...mixedFields,
    simpleInt: updateMixedFields.simpleInt,
  });

  assert.is(partialSelectUpdate.length, 2);
  assert.is(
    partialSelectUpdate.filter((it) => it.uniqueInt === allPositiveFields.uniqueInt)[0].simpleInt,
    updatePositiveFields.simpleInt,
  );
  assert.is(
    partialSelectUpdate.filter((it) => it.uniqueInt === mixedFields.uniqueInt)[0].simpleInt,
    updateMixedFields.simpleInt,
  );
});

AllIntsSuite('Update batches of several fields from table', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();
  await allIntsTable.insert(mixedFields).execute();

  await allIntsTable
    .update()
    .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
    .set({
      notNullUniqueInt: updatePositiveFields.notNullUniqueInt,
      notNullInt: updatePositiveFields.notNullInt,
      notNullIntWithDefault: updatePositiveFields.notNullIntWithDefault,
    })
    .execute();
  const updatedValues = await allIntsTable
    .update()
    .where(eq(allIntsTable.serialInt, mixedFields.serialInt!))
    .set({
      notNullUniqueInt: updateMixedFields.notNullUniqueInt,
      notNullInt: updateMixedFields.notNullInt,
      notNullIntWithDefault: updateMixedFields.notNullIntWithDefault,
    })
    .all();

  const fullSelectUpdate = await allIntsTable.select().all();
  const partialSelectUpdate = await allIntsTable
    .select({
      serialInt: allIntsTable.serialInt,
      uniqueInt: allIntsTable.uniqueInt,
      notNullUniqueInt: allIntsTable.notNullUniqueInt,
    })
    .all();

  assert.is(updatedValues.length, 1);
  assert.equal(updatedValues[0], {
    ...mixedFields,
    notNullUniqueInt: updateMixedFields.notNullUniqueInt,
    notNullInt: updateMixedFields.notNullInt,
    notNullIntWithDefault: updateMixedFields.notNullIntWithDefault,
  });

  assert.is(fullSelectUpdate.length, 2);
  assert.equal(fullSelectUpdate.filter((it) => it.serialInt === allPositiveFields.serialInt)[0], {
    ...allPositiveFields,
    notNullUniqueInt: updatePositiveFields.notNullUniqueInt,
    notNullInt: updatePositiveFields.notNullInt,
    notNullIntWithDefault: updatePositiveFields.notNullIntWithDefault,
  });
  assert.equal(fullSelectUpdate.filter((it) => it.serialInt === mixedFields.serialInt)[0], {
    ...mixedFields,
    notNullUniqueInt: updateMixedFields.notNullUniqueInt,
    notNullInt: updateMixedFields.notNullInt,
    notNullIntWithDefault: updateMixedFields.notNullIntWithDefault,
  });

  assert.is(partialSelectUpdate.length, 2);
  assert.is(
    partialSelectUpdate.filter((it) => it.serialInt === allPositiveFields.serialInt)[0]
      .notNullUniqueInt,
    updatePositiveFields.notNullUniqueInt,
  );
  assert.is(
    partialSelectUpdate.filter((it) => it.serialInt === mixedFields.serialInt)[0].notNullUniqueInt,
    updateMixedFields.notNullUniqueInt,
  );
});

// Delete

AllIntsSuite('Delete by serial int', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();
  await allIntsTable.insert(mixedFields).execute();

  await allIntsTable
    .delete()
    .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
    .execute();
  const partialSelectDelete = await allIntsTable
    .select({
      primaryInt: allIntsTable.primaryInt,
      simpleInt: allIntsTable.simpleInt,
    })
    .all();

  const deleteValue = await allIntsTable
    .delete()
    .where(eq(allIntsTable.serialInt, mixedFields.serialInt!))
    .all();
  const fullSelectDelete = await allIntsTable.select().all();

  assert.is(deleteValue.length, 1);
  assert.equal(deleteValue[0], mixedFields);

  assert.is(partialSelectDelete.length, 1);
  assert.is(
    partialSelectDelete.filter((it) => it.primaryInt === mixedFields.primaryInt)[0].simpleInt,
    mixedFields.simpleInt,
  );
  assert.not(partialSelectDelete.filter((it) => it.primaryInt === allPositiveFields.primaryInt)[0]);

  assert.is(fullSelectDelete.length, 0);
  assert.not(fullSelectDelete.filter((it) => it.serialInt === allPositiveFields.serialInt)[0]);
  assert.not(fullSelectDelete.filter((it) => it.serialInt === mixedFields.serialInt)[0]);
});

// Exception cases
// Insert

AllIntsSuite('Exception cases: insert double primary int', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();

  const doublePrimaryInt = {
    ...allPositiveFields,
    uniqueInt: Math.round(Math.random() * 100),
    notNullUniqueInt: Math.round(Math.random() * 100),
  };

  try {
    await allIntsTable.insert(doublePrimaryInt).execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(
      err.message,
      'duplicate key value violates unique constraint "table_with_all_ints_pkey"',
    );
  }
});

AllIntsSuite('Exception cases: insert double unique int', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();

  const doubleUniqueInt = {
    ...allPositiveFields,
    primaryInt: Math.round(Math.random() * 100),
    notNullUniqueInt: Math.round(Math.random() * 100),
  };

  try {
    await allIntsTable.insert(doubleUniqueInt).execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(
      err.message,
      'duplicate key value violates unique constraint "table_with_all_ints_unique_int_index"',
    );
  }
});

AllIntsSuite('Exception cases: insert float ', async (context) => {
  const allIntsTable = context.allIntsTable!;

  const addFloat = {
    ...allPositiveFields,
    simpleInt: +(Math.random() * 100).toFixed(2),
  };

  try {
    await allIntsTable.insert(addFloat).execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.ok(err.message);
  }
});

AllIntsSuite('Exception cases: onConflict insert used a non-existent index', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();

  try {
    await allIntsTable
      .insertMany([allPositiveFields, updatePositiveFields])
      .onConflict((table) => table.intWithDefaultIndex, { intWithDefault: 777 })
      .all();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(
      err.message,
      'there is no unique or exclusion constraint matching the ON CONFLICT specification',
    );
  }
});

// Exception cases
// Update

AllIntsSuite('Exception cases: update double primary int', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();
  await allIntsTable.insert(mixedFields).execute();

  const doublePrimaryIntUpdate = {
    ...allPositiveFields,
    primaryInt: mixedFields.primaryInt,
  };

  try {
    await allIntsTable
      .update()
      .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
      .set(doublePrimaryIntUpdate)
      .execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(
      err.message,
      'duplicate key value violates unique constraint "table_with_all_ints_pkey"',
    );
  }
});

AllIntsSuite('Exception cases: update double unique int', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();
  await allIntsTable.insert(mixedFields).execute();

  const doubleUniqueIntUpdate = {
    ...allPositiveFields,
    uniqueInt: mixedFields.uniqueInt,
  };

  try {
    await allIntsTable
      .update()
      .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
      .set(doubleUniqueIntUpdate)
      .execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.is(
      err.message,
      'duplicate key value violates unique constraint "table_with_all_ints_unique_int_index"',
    );
  }
});

AllIntsSuite('Exception cases: update to float', async (context) => {
  const allIntsTable = context.allIntsTable!;

  await allIntsTable.insert(allPositiveFields).execute();

  const addFloatUpdate = {
    ...allPositiveFields,
    simpleInt: +(Math.random() * 100).toFixed(2),
  };

  try {
    await allIntsTable
      .update()
      .where(eq(allIntsTable.serialInt, allPositiveFields.serialInt!))
      .set(addFloatUpdate)
      .execute();
    assert.unreachable('should have thrown');
  } catch (err) {
    assert.ok(err.message);
  }
});

AllIntsSuite('Insert1 -> Update1 -> Delete1', async (context) => {
  const allIntsTable = context.allIntsTable!;
});

// if needed
AllIntsSuite.after.each(async (context) => {
  await context.db!.session().execute(`TRUNCATE ${context.allIntsTable!.tableName()}`);
});

AllIntsSuite.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.allIntsTable!.tableName()}`);
  await context.db!.session().closeConnection();
});

AllIntsSuite.run();
