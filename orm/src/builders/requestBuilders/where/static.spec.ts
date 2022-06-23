import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import AbstractTable from '@/tables/abstractTable';
import { TestSession } from '@/../tests/utils';
import { DB } from '@/db';
import { and, eq, onEq } from './static';

class TestTable extends AbstractTable<TestTable> {
  public id = this.serial('id').primaryKey();
  public age = this.int('age');

  public tableName(): string {
    return 'test';
  }
}

interface Context {
  testSession: TestSession;
  testTable: TestTable;
}

const t = suite<Context>('static', {
  testSession: undefined!,
  testTable: undefined!,
});

t.before(async (context) => {
  context.testSession = new TestSession();
  context.testTable = new TestTable(new DB(context.testSession));
});

t('eq accepts both column and raw value as right argument', (context) => {
  const { testSession, testTable } = context;
  const { query, values } = and([
    eq(testTable.id, 1),
    eq(testTable.id, testTable.age),
  ]).toQuery({ session: testSession });

  assert.is(query, '(test."id"=$1 and test."id"=test."age")');
  assert.is(values.length, 1);
  assert.is(values[0], 1);
});

t.run();
