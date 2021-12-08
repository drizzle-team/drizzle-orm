import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import SelectAggregator from '../../aggregators/selectAggregator';
import Order from '../../highLvlBuilders/order';
import Join from '../../joinBuilders/join';
import Expr from '../../requestBuilders/where/where';
import SelectJoined from './selectJoined';
import WhereSelect from './whereSelect';

export default class SelectFrom {
  private _aggregator: SelectAggregator;

  public constructor(aggregator: SelectAggregator) {
    this._aggregator = aggregator;
  }

  public joined = (joins:
  Array<Join<any> | undefined>) => new SelectJoined(this._aggregator).apply(joins);

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
