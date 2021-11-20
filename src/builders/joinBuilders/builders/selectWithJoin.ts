/* eslint-disable import/no-cycle */
import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import DB from '../../../db/db';
import Session from '../../../db/session';
import QueryResponseMapper from '../../../mappers/responseMapper';
import AbstractTable from '../../../tables/abstractTable';
import { ExtractModel } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join, { JoinStrategy } from '../join';
import JoinWith from '../joinWith';
import SelectResponseJoin from '../responses/selectResponseWithJoin';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithTwoJoins from './selectWithTwoJoins';

export default class SelectTRBWithJoin<TTable extends AbstractTable<TTable>, TTable1>
  extends AbstractJoined<TTable, SelectResponseJoin<TTable, TTable1>> {
  private _join: Join<TTable1>;

  public constructor(
    table: TTable,
    session: Session,
    filter: Expr,
    join: Join<TTable1>,
    props: {limit?:number, offset?:number},
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
  ) {
    super(table, filter, session, props, orderBy, order);
    this._join = join;
  }

  public innerJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithTwoJoins(
      this._table,
      this._session,
      this._filter,
      this._join,
      join,
      this._props,
      this._orderBy,
      this._order,
    );
  }

  public leftJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithTwoJoins(
      this._table,
      this._session,
      this._filter,
      this._join,
      join,
      this._props,
      this._orderBy,
      this._order,
    );
  }

  public rightJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithTwoJoins(
      this._table,
      this._session,
      this._filter,
      this._join,
      join,
      this._props,
      this._orderBy,
      this._order,
    );
  }

  public fullJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn>,
    to: (table: IToTable) => AbstractColumn<TColumn>,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithTwoJoins(
      this._table,
      this._session,
      this._filter,
      this._join,
      join,
      this._props,
      this._orderBy,
      this._order,
    );
  }

  protected joins(): Join<any>[] {
    return [this._join];
  }

  protected mapResponse(result: QueryResult<any>): SelectResponseJoin<TTable, TTable1> {
    const parent: {
      [name in keyof ExtractModel<TTable1>]: AbstractColumn<ColumnType>;
    } = this._join.mappedServiceToDb;

    const response = QueryResponseMapper.map(this._table.mapServiceToDb(), result);
    const objects = QueryResponseMapper.map(parent, result);

    return new SelectResponseJoin(response, objects);
  }
}
