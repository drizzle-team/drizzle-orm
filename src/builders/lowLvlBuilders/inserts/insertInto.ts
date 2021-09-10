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
  public values = <T>(values: {[name: string]: any}[], columns: {[name in keyof T]:
    Column<ColumnType>}) => new ValuesInsert(this._aggregator).apply(values, columns);

  public build = () => this._aggregator.buildQuery();
}
