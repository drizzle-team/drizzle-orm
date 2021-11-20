import { Column } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import InsertAggregator from '../../aggregators/insertAggregator';
import ValuesInsert from './valuesInsert';

export default class InsertInto {
  private _aggregator: InsertAggregator;

  public constructor(aggregator: InsertAggregator) {
    this._aggregator = aggregator;
  }

  // @TODO refactor!!
  public values = (values: {[name: string]: any}[]) => new ValuesInsert(this._aggregator)
    .apply(values);

  public build = () => this._aggregator.buildQuery();
}
