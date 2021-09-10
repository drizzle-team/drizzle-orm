import UpdateAggregator from '../../aggregators/updateAggregator';
import Expr from '../../requestBuilders/where/where';

export default class WhereSelect<SERVICE, DB> {
  private _aggregator: UpdateAggregator;

  public constructor(aggregator: UpdateAggregator) {
    this._aggregator = aggregator;
  }

  public apply = (filters: Expr): WhereSelect<SERVICE, DB> => {
    this._aggregator.where(filters);
    return this;
  };

  public build = () => this._aggregator.buildQuery();
}
