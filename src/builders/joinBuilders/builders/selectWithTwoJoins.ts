/* eslint-disable max-len */
/* eslint-disable import/no-cycle */
import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import DB from '../../../db/db';
import { ISession } from '../../../db/session';
import AbstractTable from '../../../tables/abstractTable';
import { ExtractModel, PartialFor } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join, { JoinStrategy } from '../join';
import JoinWith from '../joinWith';
import SelectResponseTwoJoins from '../responses/selectResponseTwoJoins';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithThreeJoins from './selectWithThreeJoins';

export default class SelectTRBWithTwoJoins<TTable extends AbstractTable<TTable>, TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>,
  TPartial extends PartialFor<TTable> = {},
  TPartial1 extends PartialFor<TTable1> = {},
  TPartial2 extends PartialFor<TTable2> = {}>
  extends AbstractJoined<TTable, SelectResponseTwoJoins<TTable, TTable1, TTable2, TPartial, TPartial1, TPartial2>, TPartial> {
  private _join1: Join<TTable1>;
  private _join2: Join<TTable2>;

  private _joinedPartial?: TPartial1;
  private _joinedPartial1?: TPartial2;

  public constructor(
    table: TTable,
    session: ISession,
    filter: Expr,
    join1: Join<TTable1>,
    join2: Join<TTable2>,
    props: {limit?:number, offset?:number},
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
    distinct?: AbstractColumn<ColumnType, boolean, boolean>,
    tablePartial?: TPartial,
    joinedPartial?: TPartial1,
    joinedPartial1?: TPartial2,
  ) {
    super(table, filter, session, props, orderBy, order, distinct, tablePartial);
    this._join1 = join1;
    this._join2 = join2;

    this._joinedPartial = joinedPartial;
    this._joinedPartial1 = joinedPartial1;
  }

  public innerJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean, TTable>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
  ): SelectTRBWithThreeJoins<TTable, TTable1, TTable2, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithThreeJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
    );
  }

  public leftJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean, TTable>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
  ): SelectTRBWithThreeJoins<TTable, TTable1, TTable2, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithThreeJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
    );
  }

  public rightJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean, TTable>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
  ): SelectTRBWithThreeJoins<TTable, TTable1, TTable2, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithThreeJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
    );
  }

  public fullJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean, TTable>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
  ): SelectTRBWithThreeJoins<TTable, TTable1, TTable2, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithThreeJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
    );
  }

  protected mapResponse(result: QueryResult<any>)
    : SelectResponseTwoJoins<TTable, TTable1, TTable2, TPartial, TPartial1, TPartial2> {
    const parent:
    { [name in keyof ExtractModel<TTable1>]:
      AbstractColumn<ColumnType>; } = this._join1.mappedServiceToDb;
    const parentTwo:
    { [name in keyof ExtractModel<TTable2>]:
      AbstractColumn<ColumnType>; } = this._join2.mappedServiceToDb;

    const response = this.fullOrPartial(this._table.mapServiceToDb(), result, this._partial);
    const objects = this.fullOrPartial(parent, result, this._joinedPartial);
    const objectsTwo = this.fullOrPartial(parentTwo, result, this._joinedPartial1);

    return new SelectResponseTwoJoins(response, objects, objectsTwo);
  }

  protected joins(): Join<any>[] {
    return [this._join1, this._join2];
  }
}
