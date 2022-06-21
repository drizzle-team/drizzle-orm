import SelectAggregatorV1 from '../../aggregators/selectAggregatorV1';
import { AbstractColumn } from '../../../columns/column';
import ColumnType from '../../../columns/types/columnType';
import { AbstractTable } from '../../../tables';
import SelectAggregator from '../../aggregators/selectAggregator';
import SelectFrom, { SelectFromV1 } from './selectFrom';

export default class Select {
  // eslint-disable-next-line max-len
  public static from = <TTable extends AbstractTable<TTable>, TType extends ColumnType<any>, TColumn extends AbstractColumn<TType, boolean, boolean, TTable>, T extends {[name: string]: TColumn} = {}>(table: AbstractTable<TTable>, partial?: T) => {
    const aggregator = new SelectAggregator(table, partial);
    aggregator.appendFrom(table.tableName());
    return new SelectFrom(aggregator);
  };

  // eslint-disable-next-line max-len
  public static fromV1 = <TTable extends AbstractTable<TTable>, TType extends ColumnType<any>, TColumn extends AbstractColumn<TType, boolean, boolean, TTable>, T extends {[name: string]: TColumn} = {}>(table: AbstractTable<TTable>, partial?: T) => {
    const aggregator = new SelectAggregatorV1(table, partial);
    aggregator.appendFrom(table.tableName());
    return new SelectFromV1(aggregator);
  };
}
