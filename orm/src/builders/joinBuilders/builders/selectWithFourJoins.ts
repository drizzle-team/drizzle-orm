/* eslint-disable max-len */
import BaseLogger from '../../../logger/abstractLogger';
import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import DB from '../../../db/db';
import { ISession } from '../../../db/session';
import { AbstractTable } from '../../../tables';
import { CheckFiveTypes, ExtractModel, PartialFor } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join, { JoinStrategy } from '../join';
import JoinWith from '../joinWith';
import SelectResponseFourJoins from '../responses/selectResponseFourJoins';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithFiveJoins from './selectWithFiveJoins';

export default class SelectTRBWithFourJoins<TTable extends AbstractTable<TTable>,
 TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>, TTable3 extends AbstractTable<TTable3>, TTable4 extends AbstractTable<TTable4>,
 TPartial extends PartialFor<TTable> = {},
  TPartial1 extends PartialFor<TTable1> = {},
  TPartial2 extends PartialFor<TTable2> = {},
  TPartial3 extends PartialFor<TTable3> = {},
  TPartial4 extends PartialFor<TTable4> = {}>
  extends AbstractJoined<TTable,
  SelectResponseFourJoins<TTable, TTable1, TTable2, TTable3, TTable4, TPartial, TPartial1, TPartial2, TPartial3, TPartial4>, TPartial> {
  private _join1: Join<TTable1>;
  private _join2: Join<TTable2>;
  private _join3: Join<TTable3>;
  private _join4: Join<TTable4>;

  private _joinedPartial?: TPartial1;
  private _joinedPartial1?: TPartial2;
  private _joinedPartial2?: TPartial3;
  private _joinedPartial3?: TPartial4;

  public constructor(
    table: TTable,
    session: ISession,
    filter: Expr,
    join1: Join<TTable1>,
    join2: Join<TTable2>,
    join3: Join<TTable3>,
    join4: Join<TTable4>,
    props: {limit?:number, offset?:number},
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
    distinct?: AbstractColumn<ColumnType, boolean, boolean>,
    tablePartial?: TPartial,
    joinedPartial?: TPartial1,
    joinedPartial1?: TPartial2,
    joinedPartial2?: TPartial3,
    joinedPartial3?: TPartial4,
    logger?: BaseLogger,
  ) {
    super(table, filter, session, props, orderBy, order, distinct, tablePartial, logger);
    this._join1 = join1;
    this._join2 = join2;
    this._join3 = join3;
    this._join4 = join4;

    this._joinedPartial = joinedPartial;
    this._joinedPartial1 = joinedPartial1;
    this._joinedPartial2 = joinedPartial2;
    this._joinedPartial3 = joinedPartial3;
  }

  public innerJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>) => AbstractColumn<TColumn, boolean, boolean, CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, IToTable, TPartial, TPartial1, TPartial2, TPartial3, TPartial4, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithFiveJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      this._join4,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      this._joinedPartial3,
      partial,
      this._logger,
    );
  }

  public leftJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>) => AbstractColumn<TColumn, boolean, boolean, CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, IToTable, TPartial, TPartial1, TPartial2, TPartial3, TPartial4, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>);

    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithFiveJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      this._join4,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      this._joinedPartial3,
      partial,
      this._logger,
    );
  }

  public rightJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>) => AbstractColumn<TColumn, boolean, boolean, CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, IToTable, TPartial, TPartial1, TPartial2, TPartial3, TPartial4, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>);

    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithFiveJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      this._join4,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      this._joinedPartial3,
      partial,
      this._logger,
    );
  }

  public fullJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>) => AbstractColumn<TColumn, boolean, boolean, CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>>,
    to: (table: IToTable) => AbstractColumn<TToColumn>,
    partial?: IToPartial,
  ): SelectTRBWithFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, IToTable, TPartial, TPartial1, TPartial2, TPartial3, TPartial4, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFiveTypes<InputTable, TTable, TTable1, TTable2, TTable3, TTable4>);

    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithFiveJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      this._join4,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      this._joinedPartial3,
      partial,
      this._logger,
    );
  }

  protected joins(): Array<{
    join: Join<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, any>},
    id?: number
  }> {
    return [{ join: this._join1, partial: this._joinedPartial, id: 1 },
      { join: this._join2, partial: this._joinedPartial1, id: 2 },
      { join: this._join3, partial: this._joinedPartial2, id: 3 },
      { join: this._join4, partial: this._joinedPartial3, id: 4 }];
  }

  protected mapResponse(result: QueryResult<any>)
    : SelectResponseFourJoins<TTable, TTable1, TTable2, TTable3, TTable4, TPartial, TPartial1, TPartial2, TPartial3, TPartial4> {
    const parent:{
      [name in keyof ExtractModel<TTable1>]: AbstractColumn<ColumnType>;
    } = this._join1.mappedServiceToDb;
    const parentTwo: {
      [name in keyof ExtractModel<TTable2>]: AbstractColumn<ColumnType>;
    } = this._join2.mappedServiceToDb;
    const parentThree: {
      [name in keyof ExtractModel<TTable3>]: AbstractColumn<ColumnType>;
    } = this._join3.mappedServiceToDb;
    const parentFour:
    { [name in keyof ExtractModel<TTable4>]: AbstractColumn<ColumnType>;
    } = this._join4.mappedServiceToDb;

    const response = this.fullOrPartial(this._table.mapServiceToDb(), result, this._partial);
    const objects = this.fullOrPartial(parent, result, this._joinedPartial, 1);
    const objectsTwo = this.fullOrPartial(parentTwo, result, this._joinedPartial1, 2);
    const objectsThree = this.fullOrPartial(parentThree, result, this._joinedPartial2, 3);
    const objectsFour = this.fullOrPartial(parentFour, result, this._joinedPartial3, 4);

    return new SelectResponseFourJoins(response, objects, objectsTwo, objectsThree, objectsFour);
  }
}
