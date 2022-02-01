/* eslint-disable max-len */
import { QueryResult } from 'pg';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ISession } from '../../../db/session';
import BuilderError, { BuilderType } from '../../../errors/builderError';
import QueryResponseMapper from '../../../mappers/responseMapper';
import { AbstractTable } from '../../../tables';
import { ExtractModel, FullOrPartial, PartialFor } from '../../../tables/inferTypes';
import Order from '../../highLvlBuilders/order';
import Select from '../../lowLvlBuilders/selects/select';
import Expr from '../../requestBuilders/where/where';
import Join from '../join';

export default abstract class AbstractJoined<TTable extends AbstractTable<TTable>, TRes, TPartial extends PartialFor<TTable> = {}> {
  protected _table: TTable;
  protected _session: ISession;
  protected _filter: Expr;
  protected _distinct?: AbstractColumn<ColumnType, boolean, boolean>;
  protected _props: {limit?:number, offset?:number};
  protected _orderBy?: AbstractColumn<ColumnType, boolean, boolean>;
  protected _order?: Order;
  protected _partial?: TPartial;

  public constructor(
    table: TTable,
    filter: Expr,
    session: ISession,
    props: { limit?: number, offset?: number },
    orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order,
    distinct?: AbstractColumn<ColumnType, boolean, boolean>,
    tablePartial?: TPartial,
  ) {
    this._table = table;
    this._session = session;
    this._filter = filter;
    this._props = props;
    this._order = order;
    this._orderBy = orderBy;
    this._distinct = distinct;
    this._partial = tablePartial;
  }

  public limit = (limit: number) => {
    this._props.limit = limit;
    return this;
  };

  public offset = (offset: number) => {
    this._props.offset = offset;
    return this;
  };

  public execute = async (): Promise<TRes> => {
    const queryBuilder = Select
      .from(this._table, this._partial)
      .distinct(this._distinct)
      .joined(this.joins())
      .limit(this._props.limit)
      .offset(this._props.offset)
      .filteredBy(this._filter)
      .orderBy(this._orderBy, this._order);

    let query = '';
    let values = [];
    try {
      const builderResult = queryBuilder.build();
      query = builderResult.query;
      values = builderResult.values;
    } catch (e: any) {
      throw new BuilderError(BuilderType.JOINED_SELECT,
        this._table.tableName(), Object.values(this._table.mapServiceToDb()), e, this._filter);
    }

    const result = await this._session.execute(query, values);
    return this.mapResponse(result);
  };

  protected fullOrPartial<Table extends AbstractTable<Table>, Partial extends PartialFor<Table>>(mappedServiceToDb: {
    [name in keyof ExtractModel<Table>]: AbstractColumn<ColumnType>;
  }, result: QueryResult<any>, partial?: Partial, joinId?: number): Array<FullOrPartial<Table, Partial>> {
    if (partial) {
      return QueryResponseMapper.partialMap(partial, result, joinId) as Array<FullOrPartial<Table, Partial>>;
    }
    return QueryResponseMapper.map(mappedServiceToDb, result, joinId) as Array<FullOrPartial<Table, Partial>>;
  }

  protected abstract mapResponse(result: QueryResult<any>): TRes;

  protected abstract joins(): Array<{
    join: Join<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, any>},
    id?: number
  }>;
}
