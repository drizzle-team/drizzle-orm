import Expr from '../requestBuilders/where/where';
import Aggregator from './abstractAggregator';

export default class DeleteAggregator extends Aggregator {
  private _from: Array<string> = [];
  private _filters: Array<string> = [];
  private _delete: Array<string> = ['DELETE'];

  public constructor(tableName: string) {
    super(tableName);
  }

  public filters = (filters: Expr): DeleteAggregator => {
    this._filters.push('WHERE ');
    this._filters.push(filters.toQuery());
    return this;
  };

  public appendFrom = (tableName: string): DeleteAggregator => {
    this._from.push(' FROM ');
    this._from.push(tableName);
    return this;
  };

  public buildQuery = () => {
    // this._delete.push(this._fields.join(''));
    this._delete.push('\n');
    this._delete.push(this._from.join(''));
    this._delete.push('\n');
    this._delete.push(this._filters.join(''));

    return this._delete.join('');
  };
}
