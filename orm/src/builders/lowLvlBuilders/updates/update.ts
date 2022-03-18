import { AbstractTable } from '../../../tables';
import UpdateAggregator from '../../aggregators/updateAggregator';
import UpdateIn from './updateIn';

export default class Update {
  public static in = <TTable extends AbstractTable<TTable>>(
    table: AbstractTable<TTable>,
  ) => {
    const aggregator = new UpdateAggregator(table);
    aggregator.appendFrom(table.tableName());
    return new UpdateIn(aggregator);
  };
}
