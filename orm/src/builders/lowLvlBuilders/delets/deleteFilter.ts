import DeleteAggregator from '../../aggregators/deleteAggregator';
import Expr from '../../requestBuilders/where/where';

export default class DeleteFilter<SERVICE, DB> {
  private _aggregator: DeleteAggregator;

  public constructor(aggregator: DeleteAggregator) {
    this._aggregator = aggregator;
  }

  public apply = (filters: Expr): DeleteFilter<SERVICE, DB> => {
    this._aggregator.filters(filters);
    return this;
  };

  public build = () => this._aggregator.buildQuery();
}
