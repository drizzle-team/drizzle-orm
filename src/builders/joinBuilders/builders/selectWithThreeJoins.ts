/* eslint-disable import/no-cycle */
import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import DB from '../../../db/db';
import { ISession } from '../../../db/session';
import QueryResponseMapper from '../../../mappers/responseMapper';
import AbstractTable from '../../../tables/abstractTable';
import { ExtractModel } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join, { JoinStrategy } from '../join';
import JoinWith from '../joinWith';
import SelectResponseThreeJoins from '../responses/selectResponseThreeJoins';
import AbstractJoined from './abstractJoinBuilder';
import SelectTRBWithFourJoins from './selectWithFourJoins';

export default class SelectTRBWithThreeJoins<TTable extends AbstractTable<TTable>,
 TTable1, TTable2, TTable3>
  extends AbstractJoined<TTable, SelectResponseThreeJoins<TTable, TTable1, TTable2, TTable3>> {
  private _join1: Join<TTable1>;
  private _join2: Join<TTable2>;
  private _join3: Join<TTable3>;

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
  ) {
    super(table, filter, session, props, orderBy, order, distinct);
    this._join1 = join1;
    this._join2 = join2;
    this._join3 = join3;
  }

  public innerJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
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
    );
  }

  public leftJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
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
    );
  }

  public rightJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TColumn, boolean, boolean>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
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
    );
  }

  public fullJoin<TColumn extends ColumnType, IToTable extends AbstractTable<IToTable>>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn>,
    to: (table: IToTable) => AbstractColumn<TColumn>,
  ): SelectTRBWithFourJoins<TTable, TTable1, TTable2, TTable3, IToTable> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
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
    );
  }

  protected mapResponse(result: QueryResult<any>)
    : SelectResponseThreeJoins<TTable, TTable1, TTable2, TTable3> {
    const parent: {
      [name in keyof ExtractModel<TTable1>]: AbstractColumn<ColumnType>
    } = this._join1.mappedServiceToDb;
    const parentTwo:{
      [name in keyof ExtractModel<TTable2>]: AbstractColumn<ColumnType>;
    } = this._join2.mappedServiceToDb;
    const parentThree:{
      [name in keyof ExtractModel<TTable3>]: AbstractColumn<ColumnType>;
    } = this._join3.mappedServiceToDb;

    const response = QueryResponseMapper.map(this._table.mapServiceToDb(), result);
    const objects = QueryResponseMapper.map(parent, result);
    const objectsTwo = QueryResponseMapper.map(parentTwo, result);
    const objectsThree = QueryResponseMapper.map(parentThree, result);

    return new SelectResponseThreeJoins(response, objects, objectsTwo, objectsThree);
  }

  protected joins(): Join<any>[] {
    return [this._join1, this._join2, this._join3];
  }
}
