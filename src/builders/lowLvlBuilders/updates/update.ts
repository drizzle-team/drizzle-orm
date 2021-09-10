import UpdateAggregator from '../../aggregators/updateAggregator';
import UpdateIn from './updateIn';

export default class Update {
  public static in = (tableName: string) => {
    const aggregator = new UpdateAggregator(tableName);
    aggregator.appendFrom(tableName);
    return new UpdateIn(aggregator);
  };
}
