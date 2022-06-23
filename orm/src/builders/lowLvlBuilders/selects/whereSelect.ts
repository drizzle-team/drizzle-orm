/* eslint-disable max-classes-per-file */
import SelectAggregatorV1 from '../../aggregators/selectAggregatorV1';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import SelectAggregator from '../../aggregators/selectAggregator';
import Order from '../../highLvlBuilders/order';
import Expr from '../../requestBuilders/where/where';

export default class WhereSelect {
  private _aggregator: SelectAggregator;

  public constructor(aggregator: SelectAggregator) {
    this._aggregator = aggregator;
  }

  public limit = (limit?: number): WhereSelect => {
    this._aggregator.limit(limit);
    return this;
  };

  public offset = (offset?: number): WhereSelect => {
    this._aggregator.offset(offset);
    return this;
  };

  public orderBy = (orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order): WhereSelect => {
    this._aggregator.orderBy(orderBy, order);
    return this;
  };

  public apply = (filters: Expr): WhereSelect => {
    this._aggregator.filters(filters);
    return this;
  };

  public build = () => this._aggregator.buildQuery();
}

export class WhereSelectV1 {
  private _aggregator: SelectAggregatorV1;

  public constructor(aggregator: SelectAggregatorV1) {
    this._aggregator = aggregator;
  }

  public limit = (limit?: number): WhereSelectV1 => {
    this._aggregator.limit(limit);
    return this;
  };

  public offset = (offset?: number): WhereSelectV1 => {
    this._aggregator.offset(offset);
    return this;
  };

  public orderBy = (orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order): WhereSelectV1 => {
    this._aggregator.orderBy(orderBy, order);
    return this;
  };

  public apply = (filters: Expr): WhereSelectV1 => {
    this._aggregator.filters(filters);
    return this;
  };

  public build = () => this._aggregator.buildQuery();
}
