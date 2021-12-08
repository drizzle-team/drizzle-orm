import { AbstractTable } from '../../../tables';
import SelectAggregator from '../../aggregators/selectAggregator';
import SelectFrom from './selectFrom';

export default class Select {
  public static from = <TTable extends AbstractTable<TTable>>(table: AbstractTable<TTable>) => {
    const aggregator = new SelectAggregator(table);
    aggregator.appendFrom(table.tableName());
    return new SelectFrom(aggregator);
  };
}
