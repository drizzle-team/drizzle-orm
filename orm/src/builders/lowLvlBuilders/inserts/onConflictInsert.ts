import { Indexing } from '../../../tables/inferTypes';
import InsertAggregator from '../../aggregators/insertAggregator';
import { UpdateExpr } from '../../requestBuilders/updates/updates';

export default class OnConflictInsert {
  private _aggregator: InsertAggregator;

  public constructor(aggregator: InsertAggregator) {
    this._aggregator = aggregator;
  }

  public apply = (updates: UpdateExpr,
    column: Indexing): OnConflictInsert => {
    this._aggregator.appendOnConflict(column, updates);
    return this;
  };

  public build = () => this._aggregator.buildQuery();
}
