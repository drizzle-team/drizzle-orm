/* eslint-disable max-len */
/* eslint-disable import/no-cycle */
import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import DB from '../../../db/db';
import { ISession } from '../../../db/session';
import AbstractTable from '../../../tables/abstractTable';
import { CheckTwoTypes, ExtractModel, PartialFor } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join, { JoinStrategy } from '../join';
import JoinWith from '../joinWith';
import SelectResponseJoin from '../responses/selectResponseWithJoin';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithTwoJoins from './selectWithTwoJoins';

// eslint-disable-next-line max-len
export default class SelectTRBWithJoin<TTable extends AbstractTable<TTable>, TTable1 extends AbstractTable<TTable1>,
  TPartial extends PartialFor<TTable> = {},
  TPartial1 extends PartialFor<TTable1> = {}>
  extends AbstractJoined<TTable, SelectResponseJoin<TTable, TTable1, TPartial, TPartial1>, TPartial> {
  private _join: Join<TTable1>;
  private _joinedPartial?: TPartial1;

  public constructor(
    table: TTable,
    session: ISession,
    filter: Expr,
    join: Join<TTable1>,
    props: {limit?:number, offset?:number},
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
    distinct?: AbstractColumn<ColumnType, boolean, boolean>,
    tablePartial?: TPartial,
    joinedPartial?: TPartial1,
  ) {
    super(table, filter, session, props, orderBy, order, distinct, tablePartial);
    this._join = join;
    this._joinedPartial = joinedPartial;
  }

  public innerJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckTwoTypes<InputTable, TTable, TTable1>) => AbstractColumn<TColumn, boolean, boolean, CheckTwoTypes<InputTable, TTable, TTable1>>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable, TPartial, TPartial1, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckTwoTypes<InputTable, TTable, TTable1>);
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
      this._distinct,
      this._partial,
      this._joinedPartial,
      partial,
    );
  }

  public leftJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckTwoTypes<InputTable, TTable, TTable1>) => AbstractColumn<TColumn, boolean, boolean, CheckTwoTypes<InputTable, TTable, TTable1>>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable, TPartial, TPartial1, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckTwoTypes<InputTable, TTable, TTable1>);

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
      this._distinct,
      this._partial,
      this._joinedPartial,
      partial,
    );
  }

  public rightJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckTwoTypes<InputTable, TTable, TTable1>) => AbstractColumn<TColumn, boolean, boolean, CheckTwoTypes<InputTable, TTable, TTable1>>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable, TPartial, TPartial1, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckTwoTypes<InputTable, TTable, TTable1>);
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
      this._distinct,
      this._partial,
      this._joinedPartial,
      partial,
    );
  }

  public fullJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckTwoTypes<InputTable, TTable, TTable1>) => AbstractColumn<TColumn, boolean, boolean, CheckTwoTypes<InputTable, TTable, TTable1>>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithTwoJoins<TTable, TTable1, IToTable, TPartial, TPartial1, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckTwoTypes<InputTable, TTable, TTable1>);
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
      this._distinct,
      this._partial,
      this._joinedPartial,
      partial,
    );
  }

  protected joins(): Array<{
    join: Join<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, any>},
    id?: number
  }> {
    return [{ join: this._join, partial: this._joinedPartial, id: 1 }];
  }

  protected mapResponse(result: QueryResult<any>): SelectResponseJoin<TTable, TTable1, TPartial, TPartial1> {
    const parent: {
      [name in keyof ExtractModel<TTable1>]: AbstractColumn<ColumnType>;
    } = this._join.mappedServiceToDb;

    const response = this.fullOrPartial(this._table.mapServiceToDb(), result, this._partial);
    const objects = this.fullOrPartial(parent, result, this._joinedPartial, 1);

    return new SelectResponseJoin(response, objects);
  }
}
