/* eslint-disable import/no-extraneous-dependencies */
import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import { QueryResult } from 'pg';
import { TestSession } from 'tests/utils';
import { DB, ISession, set } from '../../../src';
import UsersTable from './usersTable';

interface Context {
  testSession?: TestSession;
  usersTable?: UsersTable;
}

const Updates = suite<Context>('Updates', {
  testSession: undefined,
  usersTable: undefined,
});

Updates.before(async (context) => {
  context.testSession = new TestSession();
  context.usersTable = new UsersTable(new DB(context.testSession));
});

Updates('Set one int field', async (context) => {
  const { usersTable, testSession } = context;
  const { query, values } = set(usersTable!.id, 1).toQuery({ session: testSession! });

  assert.is(query, '"id"=$1');
  assert.is(values.length, 1);
  assert.is(values[0], '1');
});

// 1 set for each possible type from users table

// 2 sets in `combine()` for each possible type from users table

// 3 sets in `combine()` for each possible type from users table

// 4 sets in `combine()` for different combinations of fields

Updates.run();
