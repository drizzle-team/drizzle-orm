import { Column } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { ExtractModel, Indexing } from '../../../tables/inferTypes';
import InsertAggregator from '../../aggregators/insertAggregator';
import UpdateExpr from '../../requestBuilders/updates/updates';
import OnConflictInsert from './onConflictInsert';

export default class ValuesInsert {
  private _aggregator: InsertAggregator;

  public constructor(aggregator: InsertAggregator) {
    this._aggregator = aggregator;
  }

  public apply = <T>(values: {[name: string]: any}[], columns: {[name in keyof ExtractModel<T>]
    : Column<ColumnType>})
  : ValuesInsert => {
    this._aggregator.appendColumns(values);
    this._aggregator.appendValues(columns, values);

    return this;
  };

  public onConflict = (updates: UpdateExpr,
    column: Indexing) => new OnConflictInsert(
    this._aggregator,
  ).apply(updates, column);

  public build = () => this._aggregator.buildQuery();
}
