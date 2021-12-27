/* eslint-disable @typescript-eslint/no-unused-vars */
import { Create, DbConnector } from '../..';
import {
  and, eq, like, or,
} from '../../builders';
import Order from '../../builders/highLvlBuilders/order';
import {
  greater, greaterEq, inArray, isNull, less, lessEq, notEq,
} from '../../builders/requestBuilders/where/static';
import UsersTable from '../tables/usersTable';

(async () => {
  try {
    const db = await new DbConnector()
      .connectionString('postgresql://postgres@127.0.0.1/drizzle')
      .connect();

    const usersTable = new UsersTable(db);

    // select all
    const allSelect = await usersTable.select().all();

    // select first
    const firstSelect = await usersTable.select().first();

    // select using filters
    const eqSelect = await usersTable.select().where(eq(usersTable.phone, 'hello')).all();

    const andSelect = await usersTable.select().where(
      and([eq(usersTable.phone, 'hello')]),
    ).all();

    const orSelect = await usersTable.select().where(
      or([eq(usersTable.phone, 'hello')]),
    ).all();

    // select using limit, offset
    const limitOffsetSelect = await usersTable.select({ limit: 10, offset: 10 }).all();

    const likeSelect = await usersTable.select().where(like(usersTable.phone, 'hello')).all();

    const inArraySelect = usersTable.select().where(inArray(usersTable.phone, ['hello'])).all();

    const greaterSelect = usersTable.select().where(greater(usersTable.bigIntField, 3)).all();

    const lessSelect = usersTable.select().where(less(usersTable.bigIntField, 3)).all();

    const greaterEqSelect = usersTable.select().where(greaterEq(usersTable.bigIntField, 3)).all();

    const lessEqSelect = usersTable.select().where(lessEq(usersTable.bigIntField, 3));

    const isNullSelect = usersTable.select().where(isNull(usersTable.phone)).all();

    const notEqSelect = usersTable.select().where(notEq(usersTable.phone, 'hello')).all();

    // ordered select
    const ordered = await usersTable.select().orderBy((table) => table.phone, Order.ASC).all();
  } catch (e) {
    console.log(e);
  }
})();
