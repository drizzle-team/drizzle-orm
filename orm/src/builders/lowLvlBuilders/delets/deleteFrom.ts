import DeleteAggregator from '../../aggregators/deleteAggregator';
import Expr from '../../requestBuilders/where/where';
import DeleteFilter from './deleteFilter';

export default class DeleteFrom {
  private _aggregator: DeleteAggregator;

  public constructor(aggregator: DeleteAggregator) {
    this._aggregator = aggregator;
  }

  public build = () => this._aggregator.buildQuery();

  public filteredBy = (filters: Expr) => new DeleteFilter(this._aggregator).apply(filters);
}
