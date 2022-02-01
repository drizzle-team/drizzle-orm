import { AbstractTable } from '../../tables';
import Expr from '../requestBuilders/where/where';
import Aggregator from './abstractAggregator';

export default class DeleteAggregator extends Aggregator {
  private _from: Array<string> = [];
  private _filters: Array<string> = [];
  private _values: Array<any> = [];
  private _delete: Array<string> = ['DELETE'];

  public constructor(table: AbstractTable<any>) {
    super(table);
  }

  public filters = (filters: Expr): DeleteAggregator => {
    if (filters) {
      const filterQuery = filters.toQuery();
      this._filters.push('WHERE ');
      this._filters.push(filterQuery.query);
      this._values = filterQuery.values;
    }
    return this;
  };

  public appendFrom = (tableName: string): DeleteAggregator => {
    this._from.push(' FROM ');
    this._from.push(tableName);
    return this;
  };

  public buildQuery = (): { query: string, values: Array<any> } => {
    // this._delete.push(this._fields.join(''));
    this._delete.push('\n');
    this._delete.push(this._from.join(''));
    this._delete.push('\n');
    this._delete.push(this._filters.join(''));
    this._delete.push('\n');
    this._delete.push('RETURNING');
    this._delete.push('\n');
    this._delete.push(this._fields.join(''));

    return { query: this._delete.join(''), values: this._values };
  };
}
