/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'uvu';
import * as assert from 'uvu/assert';

import { DB, DbConnector } from '../../../src';
import UsersTable, * as schema from './tables/to';
import 'dotenv/config';
import { prepareTestSqlFromSchema } from '../../utils';

let db: DB;
let usersTable: UsersTable;

test.before(async () => {
  db = await new DbConnector()
    .params({
      database: process.env.POSTGRES_DB,
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      password: process.env.POSTGRES_PASSWORD,
      user: 'postgres',
    })
    .connect();

  usersTable = new UsersTable(db);

  const sql = await prepareTestSqlFromSchema(schema);

  console.log(sql);
  await db.session().execute(sql);
});

test('import dry json', async () => {
  await usersTable.insert({
    decimalField: 1,
    createdAt: new Date(),
  }).execute();

  const usersResponse = await usersTable.select().all();

  console.log(usersResponse);

  assert.is(usersResponse.length, 1);
});

test.after(async () => {
  await db.session().execute(`DROP TABLE ${usersTable.tableName()}`);
});

test.run();
