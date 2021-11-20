import UpdateAggregator from '../../aggregators/updateAggregator';
import UpdateExpr from '../../requestBuilders/updates/updates';
import WhereSet from './whereSet';

export default class UpdateIn {
  private _aggregator: UpdateAggregator;

  public constructor(aggregator: UpdateAggregator) {
    this._aggregator = aggregator;
  }

  public columns = () => new UpdateIn(this._aggregator);

  public set = (updates: UpdateExpr) => new WhereSet(this._aggregator).apply(updates);

  public build = () => this._aggregator.buildQuery();
}
