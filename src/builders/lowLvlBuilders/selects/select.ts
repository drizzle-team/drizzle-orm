import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import SelectAggregator from '../../aggregators/selectAggregator';
import SelectFrom from './selectFrom';

export default class Select {
  public static from = (tableName: string, columns: AbstractColumn<ColumnType>[]) => {
    const aggregator = new SelectAggregator(tableName);
    aggregator.appendFrom(tableName).appendFields(columns);
    return new SelectFrom(aggregator);
  };
}
