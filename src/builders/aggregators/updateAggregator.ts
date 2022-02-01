import { AbstractTable } from '../../tables';
import { UpdateExpr } from '../requestBuilders/updates/updates';
import Expr from '../requestBuilders/where/where';
import Aggregator from './abstractAggregator';

export default class UpdateAggregator extends Aggregator {
  private _updates: Array<string> = [];
  private _filters: Array<string> = [];
  private _from: Array<string> = [];
  private _update: Array<string> = ['UPDATE'];

  public constructor(table: AbstractTable<any>) {
    super(table);
  }

  public where = (filters: Expr): UpdateAggregator => {
    if (filters) {
      this._filters.push('WHERE ');
      this._filters.push(filters.toQuery().query);
    }
    return this;
  };

  public appendFrom = (tableName: string): UpdateAggregator => {
    this._from.push(' ');
    this._from.push(tableName);
    return this;
  };

  public set = (updates: UpdateExpr): UpdateAggregator => {
    this._updates.push(`\nSET ${updates.toQuery()}`);
    return this;
  };

  public buildQuery = () => {
    this._update.push(this._from.join(''));
    this._update.push('\n');
    this._update.push(this._updates.join(''));
    this._update.push('\n');
    this._update.push(this._filters.join(''));
    this._update.push('\n');
    this._update.push('RETURNING');
    this._update.push('\n');
    this._update.push(this._fields.join(''));

    return this._update.join('');
  };
}
