/* eslint-disable max-len */
/* eslint-disable import/no-cycle */
import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import DB from '../../../db/db';
import { ISession } from '../../../db/session';
import AbstractTable from '../../../tables/abstractTable';
import { CheckFourTypes, ExtractModel, PartialFor } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join, { JoinStrategy } from '../join';
import JoinWith from '../joinWith';
import SelectResponseThreeJoins from '../responses/selectResponseThreeJoins';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithFourJoins from './selectWithFourJoins';

export default class SelectTRBWithThreeJoins<TTable extends AbstractTable<TTable>,
 TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>, TTable3 extends AbstractTable<TTable3>,
  TPartial extends PartialFor<TTable> = {},
  TPartial1 extends PartialFor<TTable1> = {},
  TPartial2 extends PartialFor<TTable2> = {},
  TPartial3 extends PartialFor<TTable3> = {}>
  extends AbstractJoined<TTable, SelectResponseThreeJoins<TTable, TTable1, TTable2, TTable3, TPartial, TPartial1, TPartial2, TPartial3>, TPartial> {
  private _join1: Join<TTable1>;
  private _join2: Join<TTable2>;
  private _join3: Join<TTable3>;

  private _joinedPartial?: TPartial1;
  private _joinedPartial1?: TPartial2;
  private _joinedPartial2?: TPartial3;

  public constructor(
    table: TTable,
    session: ISession,
    filter: Expr,
    join1: Join<TTable1>,
    join2: Join<TTable2>,
    join3: Join<TTable3>,
    props: {limit?:number, offset?:number},
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
    distinct?: AbstractColumn<ColumnType, boolean, boolean>,
    tablePartial?: TPartial,
    joinedPartial?: TPartial1,
    joinedPartial1?: TPartial2,
    joinedPartial2?: TPartial3,
  ) {
    super(table, filter, session, props, orderBy, order, distinct, tablePartial);
    this._join1 = join1;
    this._join2 = join2;
    this._join3 = join3;

    this._joinedPartial = joinedPartial;
    this._joinedPartial1 = joinedPartial1;
    this._joinedPartial2 = joinedPartial2;
  }

  public innerJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>) => AbstractColumn<TColumn, boolean, boolean, CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable, TPartial, TPartial1, TPartial2, TPartial3, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithFourJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      partial,
    );
  }

  public leftJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>) => AbstractColumn<TColumn, boolean, boolean, CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable, TPartial, TPartial1, TPartial2, TPartial3, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithFourJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      partial,
    );
  }

  public rightJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>) => AbstractColumn<TColumn, boolean, boolean, CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable, TPartial, TPartial1, TPartial2, TPartial3, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithFourJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      partial,
    );
  }

  public fullJoin<InputTable extends AbstractTable<InputTable>, TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    fromTable: { new(db: DB): InputTable ;},
    table: { new(db: DB): IToTable ;},
    from: (table: CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>) => AbstractColumn<TColumn, boolean, boolean, CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable, TPartial, TPartial1, TPartial2, TPartial3, IToPartial> {
    const toTable = this._table.db.create(table);
    const tableFrom = this._table.db.create(fromTable);

    const fromColumn = from(tableFrom as unknown as CheckFourTypes<InputTable, TTable, TTable1, TTable2, TTable3>);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithFourJoins(
      this._table,
      this._session,
      this._filter,
      this._join1,
      this._join2,
      this._join3,
      join,
      this._props,
      this._orderBy,
      this._order,
      this._distinct,
      this._partial,
      this._joinedPartial,
      this._joinedPartial1,
      this._joinedPartial2,
      partial,
    );
  }

  protected mapResponse(result: QueryResult<any>)
    : SelectResponseThreeJoins<TTable, TTable1, TTable2, TTable3, TPartial, TPartial1, TPartial2, TPartial3> {
    const parent: {
      [name in keyof ExtractModel<TTable1>]: AbstractColumn<ColumnType>
    } = this._join1.mappedServiceToDb;
    const parentTwo:{
      [name in keyof ExtractModel<TTable2>]: AbstractColumn<ColumnType>;
    } = this._join2.mappedServiceToDb;
    const parentThree:{
      [name in keyof ExtractModel<TTable3>]: AbstractColumn<ColumnType>;
    } = this._join3.mappedServiceToDb;

    const response = this.fullOrPartial(this._table.mapServiceToDb(), result, this._partial);
    const objects = this.fullOrPartial(parent, result, this._joinedPartial, 1);
    const objectsTwo = this.fullOrPartial(parentTwo, result, this._joinedPartial1, 2);
    const objectsThree = this.fullOrPartial(parentThree, result, this._joinedPartial2, 3);

    return new SelectResponseThreeJoins(response, objects, objectsTwo, objectsThree);
  }

  protected joins(): Array<{
    join: Join<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, any>},
    id?: number
  }> {
    return [{ join: this._join1, partial: this._joinedPartial, id: 1 },
      { join: this._join2, partial: this._joinedPartial1, id: 2 },
      { join: this._join3, partial: this._joinedPartial2, id: 3 }];
  }
}
