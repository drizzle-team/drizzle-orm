import DeleteAggregator from '../../aggregators/deleteAggregator';
import DeleteFrom from './deleteFrom';

export default class Delete {
  public static from = (tableName: string): DeleteFrom => {
    const aggregator = new DeleteAggregator(tableName);
    aggregator.appendFrom(tableName);
    return new DeleteFrom(aggregator);
  };
}
