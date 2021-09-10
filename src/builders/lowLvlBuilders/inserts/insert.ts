import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import InsertAggregator from '../../aggregators/insertAggregator';
import InsertInto from './insertInto';

export default class Insert {
  public static into = (tableName: string, columns: AbstractColumn<ColumnType>[]) => {
    const aggregator = new InsertAggregator(tableName);
    aggregator.appendFrom(tableName).appendFields(columns);
    return new InsertInto(aggregator);
  };
}
