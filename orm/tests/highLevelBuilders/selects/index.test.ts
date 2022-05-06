/* eslint-disable import/no-extraneous-dependencies */
import { test, suite } from 'uvu';
import * as assert from 'uvu/assert';

import { DB, DbConnector } from '../../../src';
import UsersTable, * as schema from './tables/to';
import 'dotenv/config';
import { prepareTestSqlFromSchema } from '../../utils';

interface Context {
  db?: DB;
  usersTable?: UsersTable;
}

const User = suite<Context>('User', {
  db: undefined,
  usersTable: undefined,
});

User.before(async (context) => {
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
  context.usersTable = new UsersTable(db);

  const sql = await prepareTestSqlFromSchema(schema);

  await db.session().execute(sql);
});

User('import dry json', async (context) => {
  await context.usersTable!.insert({
    decimalField: 1,
    createdAt: new Date(),
  }).execute();

  const usersResponse = await context.usersTable!.select().all();

  assert.is(usersResponse.length, 1);
});

User.after(async (context) => {
  await context.db!.session().execute(`DROP TABLE ${context.usersTable!.tableName()}`);
});

User.run();
