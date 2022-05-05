/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { QueryResult } from 'pg';
import { DB, ISession } from '../../../src';
import UsersTable from './usersTable';
import { eq } from '../../../src/builders/requestBuilders/where/static';

let usersTable: UsersTable;
let testSession: TestSession;

class TestSession extends ISession {
  public execute(query: string, values?: any[]): Promise<QueryResult<any>> {
    return { rows: [] } as any;
  }

  public parametrized(num: number): string {
    return `$${num}`;
  }
}

test.before(async () => {
  testSession = new TestSession();
  usersTable = new UsersTable(new DB(testSession));
});

test('Filter one int field by eq', async () => {
  const { query, values } = eq(usersTable.id, 1).toQuery({ session: testSession });

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

test.run();
