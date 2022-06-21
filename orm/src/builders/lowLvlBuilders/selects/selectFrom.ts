/* eslint-disable max-classes-per-file */
/* eslint-disable max-len */
import AbstractTable from '../../../tables/abstractTable';
import SelectAggregatorV1 from '../../aggregators/selectAggregatorV1';
import { JoinType } from '../../highLvlBuilders/joins/selectJoinBuilder';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import SelectAggregator from '../../aggregators/selectAggregator';
import Order from '../../highLvlBuilders/order';
import Join from '../../joinBuilders/join';
import Expr from '../../requestBuilders/where/where';
import SelectJoined, { SelectJoinedV1 } from './selectJoined';
import WhereSelect, { WhereSelectV1 } from './whereSelect';

export default class SelectFrom {
  private _aggregator: SelectAggregator;

  public constructor(aggregator: SelectAggregator) {
    this._aggregator = aggregator;
  }

  public joined = (joins:
  Array<JoinType<AbstractTable<any>>>) => new SelectJoined(this._aggregator).apply(joins);

  public limit = (limit?: number): SelectFrom => {
    this._aggregator.limit(limit);
    return this;
  };

  public offset = (offset?: number): SelectFrom => {
    this._aggregator.offset(offset);
    return this;
  };

  public orderBy = (orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order): SelectFrom => {
    this._aggregator.orderBy(orderBy, order);
    return this;
  };

  public distinct = (column?: AbstractColumn<ColumnType, boolean, boolean>): SelectFrom => {
    if (column) {
      this._aggregator.distinct(column);
    }
    return this;
  };

  public filteredBy = (filters: Expr) => new WhereSelect(this._aggregator).apply(filters);

  public build = () => this._aggregator.buildQuery();
}

export class SelectFromV1 {
  private _aggregator: SelectAggregatorV1;

  public constructor(aggregator: SelectAggregatorV1) {
    this._aggregator = aggregator;
  }

  public joined = (joins:
  Array<{
    join: Join<any>, partial?: { [name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, any> },
    id?: number
  }>) => new SelectJoinedV1(this._aggregator).apply(joins);

  public limit = (limit?: number): SelectFromV1 => {
    this._aggregator.limit(limit);
    return this;
  };

  public offset = (offset?: number): SelectFromV1 => {
    this._aggregator.offset(offset);
    return this;
  };

  public orderBy = (orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order): SelectFromV1 => {
    this._aggregator.orderBy(orderBy, order);
    return this;
  };

  public distinct = (column?: AbstractColumn<ColumnType, boolean, boolean>): SelectFromV1 => {
    if (column) {
      this._aggregator.distinct(column);
    }
    return this;
  };

  public filteredBy = (filters: Expr) => new WhereSelectV1(this._aggregator).apply(filters);

  public build = () => this._aggregator.buildQuery();
}
