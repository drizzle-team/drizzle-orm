import { AbstractTable } from '../../tables';
import { UpdateExpr } from '../requestBuilders/updates/updates';
import Expr from '../requestBuilders/where/where';
import Aggregator from './abstractAggregator';

export default class UpdateAggregator extends Aggregator {
  private _updates: Array<string> = [];
  private _filters: Array<string> = [];
  private _from: Array<string> = [];
  private _values: Array<any> = [];
  private _update: Array<string> = ['UPDATE'];

  public constructor(table: AbstractTable<any>) {
    super(table);
  }

  public where = (filters: Expr): UpdateAggregator => {
    if (filters) {
      const currentPointerPosition = this._values.length > 0 ? this._values.length + 1 : undefined;
      const filterQuery = filters.toQuery({
        position: currentPointerPosition,
        session: this._table.db.session(),
      });

      this._filters.push('WHERE ');
      this._filters.push(filterQuery.query);

      this._values.push(...filterQuery.values);
    }
    return this;
  };

  public appendFrom = (tableName: string): UpdateAggregator => {
    this._from.push(' ');
    this._from.push(tableName);
    return this;
  };

  public set = (updates: UpdateExpr): UpdateAggregator => {
    const setQuery = updates.toQuery({ session: this._table.db.session() });
    this._updates.push(`\nSET ${setQuery.query}`);
    this._values.push(...setQuery.values);
    return this;
  };

  public buildQuery = (): { query: string, values: Array<any> } => {
    this._update.push(this._from.join(''));
    this._update.push('\n');
    this._update.push(this._updates.join(''));
    this._update.push('\n');
    this._update.push(this._filters.join(''));
    this._update.push('\n');
    this._update.push('RETURNING');
    this._update.push('\n');
    this._update.push(this._fields.join(''));

    return { query: this._update.join(''), values: this._values };
  };
}
