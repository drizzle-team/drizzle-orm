/* eslint-disable max-len */
import { QueryResult } from 'pg';
import BaseLogger from '../../../logger/abstractLogger';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ISession } from '../../../db/session';
import { AbstractTable } from '../../../tables';
import { ExtractModel, PartialFor } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join from '../join';
import SelectResponseFiveJoins from '../responses/selectResponseFiveJoins';
import AbstractJoined from './abstractJoinBuilder';

export default class SelectTRBWithFiveJoins<TTable extends AbstractTable<TTable>,
 TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>, TTable3 extends AbstractTable<TTable3>, TTable4 extends AbstractTable<TTable4>, TTable5 extends AbstractTable<TTable5>,
 TPartial extends PartialFor<TTable> = {},
  TPartial1 extends PartialFor<TTable1> = {},
  TPartial2 extends PartialFor<TTable2> = {},
  TPartial3 extends PartialFor<TTable3> = {},
  TPartial4 extends PartialFor<TTable4> = {},
  TPartial5 extends PartialFor<TTable5> = {}>
  extends AbstractJoined<TTable,
  SelectResponseFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, TTable5, TPartial, TPartial1, TPartial2, TPartial3, TPartial4, TPartial5>, TPartial> {
  private _join1: Join<TTable1>;
  private _join2: Join<TTable2>;
  private _join3: Join<TTable3>;
  private _join4: Join<TTable4>;
  private _join5: Join<TTable5>;

  private _joinedPartial?: TPartial1;
  private _joinedPartial1?: TPartial2;
  private _joinedPartial2?: TPartial3;
  private _joinedPartial3?: TPartial4;
  private _joinedPartial4?: TPartial5;

  public constructor(
    table: TTable,
    session: ISession,
    filter: Expr,
    join1: Join<TTable1>,
    join2: Join<TTable2>,
    join3: Join<TTable3>,
    join4: Join<TTable4>,
    join5: Join<TTable5>,
    props: {limit?:number, offset?:number},
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
    distinct?: AbstractColumn<ColumnType, boolean, boolean>,
    tablePartial?: TPartial,
    joinedPartial?: TPartial1,
    joinedPartial1?: TPartial2,
    joinedPartial2?: TPartial3,
    joinedPartial3?: TPartial4,
    joinedPartial4?: TPartial5,
    logger?: BaseLogger,
  ) {
    super(table, filter, session, props, orderBy, order, distinct, tablePartial, logger);
    this._join1 = join1;
    this._join2 = join2;
    this._join3 = join3;
    this._join4 = join4;
    this._join5 = join5;

    this._joinedPartial = joinedPartial;
    this._joinedPartial1 = joinedPartial1;
    this._joinedPartial2 = joinedPartial2;
    this._joinedPartial3 = joinedPartial3;
    this._joinedPartial4 = joinedPartial4;
  }

  protected joins(): Array<{
    join: Join<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, any>},
    id?: number
  }> {
    return [{ join: this._join1, partial: this._joinedPartial, id: 1 },
      { join: this._join2, partial: this._joinedPartial1, id: 2 },
      { join: this._join3, partial: this._joinedPartial2, id: 3 },
      { join: this._join4, partial: this._joinedPartial3, id: 4 },
      { join: this._join5, partial: this._joinedPartial4, id: 5 }];
  }

  protected mapResponse(result: QueryResult<any>)
    : SelectResponseFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, TTable5, TPartial, TPartial1, TPartial2, TPartial3, TPartial4, TPartial5> {
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
    const parentFive:
    { [name in keyof ExtractModel<TTable5>]: AbstractColumn<ColumnType>;
    } = this._join5.mappedServiceToDb;

    // TODO map ids for join properly
    const response = this.fullOrPartial(this._table.mapServiceToDb(), result, this._partial);
    const objects = this.fullOrPartial(parent, result, this._joinedPartial, 1);
    const objectsTwo = this.fullOrPartial(parentTwo, result, this._joinedPartial1, 2);
    const objectsThree = this.fullOrPartial(parentThree, result, this._joinedPartial2, 3);
    const objectsFour = this.fullOrPartial(parentFour, result, this._joinedPartial3, 4);
    const objectsFive = this.fullOrPartial(parentFive, result, this._joinedPartial4, 5);

    return new SelectResponseFiveJoins(response, objects, objectsTwo,
      objectsThree, objectsFour, objectsFive);
  }
}
