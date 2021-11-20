import { AbstractTable } from '../../../tables';
import DeleteAggregator from '../../aggregators/deleteAggregator';
import DeleteFrom from './deleteFrom';

export default class Delete {
  public static from = <TTable extends AbstractTable<TTable>>(
    table: AbstractTable<TTable>,
  ): DeleteFrom => {
    const aggregator = new DeleteAggregator(table);
    aggregator.appendFrom(table.tableName());
    return new DeleteFrom(aggregator);
  };
}
