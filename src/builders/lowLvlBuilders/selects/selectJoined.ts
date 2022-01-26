/* eslint-disable max-len */
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import SelectAggregator from '../../aggregators/selectAggregator';
import Order from '../../highLvlBuilders/order';
import Join from '../../joinBuilders/join';
import Expr from '../../requestBuilders/where/where';
import WhereSelect from './whereSelect';

export default class SelectJoined {
  private _aggregator: SelectAggregator;

  public constructor(aggregator: SelectAggregator) {
    this._aggregator = aggregator;
  }

  public apply = (joins: Array<{join: Join<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, any>}}>): SelectJoined => {
    this._aggregator.join(joins);
    return this;
  };

  public limit = (limit?: number): SelectJoined => {
    this._aggregator.limit(limit);
    return this;
  };

  public offset = (offset?: number): SelectJoined => {
    this._aggregator.offset(offset);
    return this;
  };

  public orderBy = (orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order): SelectJoined => {
    this._aggregator.orderBy(orderBy, order);
    return this;
  };

  public filteredBy = (filters: Expr) => new WhereSelect(this._aggregator).apply(filters);

  public build = () => this._aggregator.buildQuery();
}
