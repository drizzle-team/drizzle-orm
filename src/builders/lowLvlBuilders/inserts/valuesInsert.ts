import { Indexing } from '../../../tables/inferTypes';
import InsertAggregator from '../../aggregators/insertAggregator';
import UpdateExpr from '../../requestBuilders/updates/updates';
import OnConflictInsert from './onConflictInsert';

export default class ValuesInsert {
  private _aggregator: InsertAggregator;

  public constructor(aggregator: InsertAggregator) {
    this._aggregator = aggregator;
  }

  public apply = (values: {[name: string]: any}[])
  : ValuesInsert => {
    this._aggregator.appendColumns();
    this._aggregator.appendValues(values);

    return this;
  };

  public onConflict = (updates: UpdateExpr,
    column: Indexing) => new OnConflictInsert(
    this._aggregator,
  ).apply(updates, column);

  public build = () => this._aggregator.buildQuery();
}
