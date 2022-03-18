import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { AbstractTable } from '../../../tables';
import SelectAggregator from '../../aggregators/selectAggregator';
import SelectFrom from './selectFrom';

export default class Select {
  // eslint-disable-next-line max-len
  public static from = <TTable extends AbstractTable<TTable>, TType extends ColumnType<any>, TColumn extends AbstractColumn<TType, boolean, boolean, TTable>, T extends {[name: string]: TColumn} = {}>(table: AbstractTable<TTable>, partial?: T) => {
    const aggregator = new SelectAggregator(table, partial);
    aggregator.appendFrom(table.tableName());
    return new SelectFrom(aggregator);
  };
}
