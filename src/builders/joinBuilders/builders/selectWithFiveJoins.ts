import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import Session from '../../../db/session';
import QueryResponseMapper from '../../../mappers/responseMapper';
import { AbstractTable } from '../../../tables';
import { ExtractModel } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';
import Join from '../join';
import SelectResponseFiveJoins from '../responses/selectResponseFiveJoins';
import AbstractJoined from './abstractJoinBuilder';

export default class SelectTRBWithFiveJoins<TTable extends AbstractTable<TTable>,
 TTable1, TTable2, TTable3, TTable4, TTable5>
  extends AbstractJoined<TTable,
  SelectResponseFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, TTable5>> {
  private _join1: Join<TTable1>;
  private _join2: Join<TTable2>;
  private _join3: Join<TTable3>;
  private _join4: Join<TTable4>;
  private _join5: Join<TTable5>;

  public constructor(
    table: TTable,
    session: Session,
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
  ) {
    super(table, filter, session, props, orderBy, order, distinct);
    this._join1 = join1;
    this._join2 = join2;
    this._join3 = join3;
    this._join4 = join4;
    this._join5 = join5;
  }

  protected joins(): Join<any>[] {
    return [this._join1, this._join2, this._join3, this._join4, this._join5];
  }

  protected mapResponse(result: QueryResult<any>)
    : SelectResponseFiveJoins<TTable, TTable1, TTable2, TTable3, TTable4, TTable5> {
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

    const response = QueryResponseMapper.map(this._table.mapServiceToDb(), result);
    const objects = QueryResponseMapper.map(parent, result);
    const objectsTwo = QueryResponseMapper.map(parentTwo, result);
    const objectsThree = QueryResponseMapper.map(parentThree, result);
    const objectsFour = QueryResponseMapper.map(parentFour, result);
    const objectsFive = QueryResponseMapper.map(parentFive, result);

    return new SelectResponseFiveJoins(response, objects, objectsTwo,
      objectsThree, objectsFour, objectsFive);
  }
}
