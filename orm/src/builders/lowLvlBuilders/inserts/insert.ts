import { AbstractTable } from '../../../tables';
import InsertAggregator from '../../aggregators/insertAggregator';
import InsertInto from './insertInto';

export default class Insert {
  public static into = <TTable extends AbstractTable<TTable>>(table: AbstractTable<TTable>) => {
    const aggregator = new InsertAggregator(table);
    // aggregator.appendFrom(table.tableName());
    return new InsertInto(aggregator);
  };
}
