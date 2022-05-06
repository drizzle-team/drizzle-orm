/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { DB, DbConnector } from '../../../src';
import 'dotenv/config';
import * as schema from './tables/to';
import { prepareTestSqlFromSchema } from '../../../../kit/tests/utils';

let db: DB;

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

  console.log(prepareTestSqlFromSchema(schema));

  await db.session().execute('CREATE TABLE IF NOT EXISTS test_users (user_id int PRIMARY KEY,username VARCHAR ( 50 ) UNIQUE NOT NULL);');

  // const { initSQL, migrationSQL } = await prepareTestSQL(
  //   path.join(__dirname, 'tables'),
  // );

  // console.log('initSQL: ', initSQL);
  // console.log('migrationSQL:', migrationSQL);
});

test('import dry json', async () => {
  await db.session().execute('INSERT INTO test_users VALUES (1, \'test\')');
  const res = await db.session().execute('SELECT * FROM test_users');
  assert.is(res.rows.length, 1);
});

test.after(async () => {
  await db.session().execute('DROP TABLE test_users');
});

test.run();
