/* eslint-disable @typescript-eslint/no-unused-vars */
import { Create, DbConnector } from '../..';
import {
  and, eq, like, or,
} from '../../builders';
import Order from '../../builders/highLvlBuilders/order';
import {
  greater, greaterEq, inArray, isNull, less, lessEq, notEq,
} from '../../builders/requestBuilders/where/static';
import ConsoleLogger from '../../logger/consoleLogger';
import UsersTable from '../tables/usersTable';

(async () => {
  try {
    const db = await new DbConnector()
      .connectionString('postgresql://postgres@127.0.0.1/migrator')
      .connect();

    const usersTable = new UsersTable(db);

    db.useLogger(new ConsoleLogger());

    // select all
    const allSelect = await usersTable.select().all();

    // select first
    const firstSelect = await usersTable.select().all();

    // select using filters
    const eqSelect = await usersTable.select().where(eq(usersTable.phone, 'hello')).all();

    const andSelect = await usersTable.select().where(
      and([eq(usersTable.phone, 'hello')]),
    ).all();

    const orSelect = await usersTable.select().where(
      or([eq(usersTable.phone, 'hello')]),
    ).all();

    // select using limit, offset
    const limitOffsetSelect = await usersTable.select().limit(20).offset(20).all();

    const likeSelect = await usersTable.select().where(like(usersTable.phone, 'hello')).all();

    const inArraySelect = await usersTable.select().where(inArray(usersTable.phone, ['hello'])).all();

    const greaterSelect = await usersTable.select().where(greater(usersTable.bigIntField, 3)).all();

    const lessSelect = await usersTable.select().where(less(usersTable.bigIntField, 3)).all();

    const greaterEqSelect = await usersTable.select().where(greaterEq(usersTable.bigIntField, 3))
      .all();

    const lessEqSelect = await usersTable.select().where(lessEq(usersTable.bigIntField, 3));

    const isNullSelect = await usersTable.select().where(isNull(usersTable.phone)).all();

    const notEqSelect = await usersTable.select().where(notEq(usersTable.phone, 'hello')).all();

    const partialSelect = await usersTable.select({
      mappedId: usersTable.id,
      mappedPhone: usersTable.phone,
    }).all();

    // const { mappedId, mappedPhone } = partialSelect;

    // ordered select
    const ordered = await usersTable.select().orderBy((table) => table.phone, Order.ASC).all();
  } catch (e) {
    console.log(e);
  }
})();
