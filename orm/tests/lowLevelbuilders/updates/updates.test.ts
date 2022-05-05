/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { QueryResult } from 'pg';
import { DB, ISession, set } from '../../../src';
import UsersTable from './usersTable';

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

test('Set one int field', async () => {
  const { query, values } = set(usersTable.id, 1).toQuery({ session: testSession });

  assert.is(query, '"id"=$1');
  assert.is(values.length, 1);
  assert.is(values[0], '1');
});

// 1 set for each possible type from users table

// 2 sets in `combine()` for each possible type from users table

// 3 sets in `combine()` for each possible type from users table

// 4 sets in `combine()` for different combinations of fields

test.run();
