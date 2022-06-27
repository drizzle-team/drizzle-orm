/* eslint-disable import/no-extraneous-dependencies */
import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import { DB } from '../../../src';
import UsersTable from './usersTable';
import { eq } from '../../../src/builders/requestBuilders/where/static';
import { TestSession } from '../../utils';

interface Context {
  testSession?: TestSession;
  usersTable?: UsersTable;
}

const Filters = suite<Context>('Filters', {
  testSession: undefined,
  usersTable: undefined,
});

Filters.before(async (context) => {
  context.testSession = new TestSession();
  context.usersTable = new UsersTable(new DB(context.testSession));
});

Filters('Filter one int field by eq', async (context) => {
  const { usersTable, testSession } = context;

  const { query, values } = eq(usersTable!.id, 1).toQuery({ session: testSession! });

  assert.is(query, 'users."id"=$1');
  assert.is(values.length, 1);
  assert.is(values[0], 1);
});

// 1 filter for each possible type from users table

// 2 filters in and for each possible type from users table

// 2 filters in and for each possible type from users table

// 3 filters in and for each possible type from users table

// 3 filters in or for each possible type from users table

// 4 filters in or for each possible type from users table + sub-or/sub-and
// ex. or([and([]), eq()])

// 4 filters in and for each possible type from users table + sub-or/sub-and
// ex. and([or([]), eq(), and()])

Filters.run();
