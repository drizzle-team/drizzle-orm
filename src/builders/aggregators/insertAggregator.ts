import { IndexedColumn } from '../../columns/column';
import { AbstractTable } from '../../tables';
import { ExtractModel, Indexing } from '../../tables/inferTypes';
import UpdateExpr from '../requestBuilders/updates/updates';
import Aggregator from './abstractAggregator';

export default class InsertAggregator extends Aggregator {
  private _onConflict: Array<string> = [];
  private _columns: Array<string> = [];
  private _values: Array<string> = [];
  private _from: Array<string> = [];
  private _insert: Array<string> = ['INSERT INTO'];

  public constructor(table: AbstractTable<any>) {
    super(table);
    this._from.push(' ');
    this._from.push(table.tableName());
  }

  public appendColumns = () => {
    const mapper = this._table.mapServiceToDb();
    const columns = Object.values(mapper);

    for (let i = 0; i < columns.length; i += 1) {
      const column = columns[i];

      this._columns.push('"');
      this._columns.push(column.getColumnName());
      this._columns.push('"');

      if (i < columns.length - 1) {
        this._columns.push(', ');
      }
    }
  };

  public appendValues = (values: {[name: string]: any}[]) => {
    // @TODO Check if values not empty
    const mapper = this._table.mapServiceToDb();

    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];

      this._values.push('(');
      const entries = Object.entries(mapper);
      entries.forEach(([key], index) => {
        const valueToInsert = value[key as keyof ExtractModel<any>];
        const isKeyExistsInValue = key.toString() in value;

        const column = mapper[key as keyof ExtractModel<any>];

        if (isKeyExistsInValue) {
          if (valueToInsert !== undefined && valueToInsert !== null) {
            this._values.push(column.getColumnType().insertStrategy(valueToInsert));
          } else {
            this._values.push('null');
          }
        } else {
          this._values.push('DEFAULT');
        }

        if (index < entries.length - 1) {
          this._values.push(', ');
        }
      });

      if (i < values.length - 1) {
        this._values.push('),\n');
      } else {
        this._values.push(')\n');
      }
    }
  };

  public appendOnConflict = (column: Indexing,
    updates?: UpdateExpr) => {
    if (column) {
      const indexName = column instanceof IndexedColumn
        ? column.getColumnName() : column.getColumns().map((it) => it.getColumnName()).join(',');
      this._onConflict.push(`ON CONFLICT (${indexName})\n`);
      if (updates) {
        this._onConflict.push('DO UPDATE\n');
        this._onConflict.push(`SET ${updates.toQuery()}`);
      } else {
        this._onConflict.push('DO NOTHING\n');
      }
    }
    return this;
  };

  public buildQuery = () => {
    this._insert.push(this._from.join(''));
    this._insert.push(' (');
    this._insert.push(this._columns.join(''));
    this._insert.push(') ');
    this._insert.push('VALUES\n');
    this._insert.push(this._values.join(''));
    this._insert.push('\n');
    this._insert.push(this._onConflict.join(''));
    this._insert.push('\n');
    this._insert.push('RETURNING');
    this._insert.push('\n');
    this._insert.push(this._fields.join(''));

    return this._insert.join('');
  };
}
