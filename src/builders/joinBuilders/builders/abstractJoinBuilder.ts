import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import Session from '../../../db/session';
import BuilderError, { BuilderType } from '../../../errors/builderError';
import { DatabaseSelectError } from '../../../errors/dbErrors';
import { AbstractTable } from '../../../tables';
import Order from '../../highLvlBuilders/order';
import Select from '../../lowLvlBuilders/selects/select';
import Expr from '../../requestBuilders/where/where';
import Join from '../join';

export default abstract class AbstractJoined<TTable extends AbstractTable<TTable>, TRes> {
  protected _table: TTable;
  protected _session: Session;
  protected _filter: Expr;
  protected _props: {limit?:number, offset?:number};
  protected _orderBy?: AbstractColumn<ColumnType, boolean, boolean>;
  protected _order?: Order;

  public constructor(
    table: TTable,
    filter: Expr,
    session: Session,
    props: {limit?:number, offset?:number},
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
  ) {
    this._table = table;
    this._session = session;
    this._filter = filter;
    this._props = props;
    this._order = order;
    this._orderBy = orderBy;
  }

  public execute = async (): Promise<TRes> => {
    const queryBuilder = Select
      .from(this._table)
      .joined(this.joins())
      .limit(this._props.limit)
      .offset(this._props.offset)
      .filteredBy(this._filter)
      .orderBy(this._orderBy, this._order);

    let query = '';
    try {
      query = queryBuilder.build();
    } catch (e: any) {
      throw new BuilderError(BuilderType.JOINED_SELECT,
        this._table.tableName(), Object.values(this._table.mapServiceToDb()), e, this._filter);
    }

    const result = await this._session.execute(query);
    if (result.isLeft()) {
      const { reason } = result.value;
      throw new DatabaseSelectError(this._table.tableName(), reason, query);
    } else {
      return this.mapResponse(result.value);
    }
  };

  protected abstract mapResponse(result: QueryResult<any>): TRes;

  protected abstract joins(): Array<Join<any>>;
}
