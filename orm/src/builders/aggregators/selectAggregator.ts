/* eslint-disable import/no-cycle */
/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { AbstractTable } from '../../tables';
import { escape } from '../../utils/escape';
import { JoinType } from '../highLvlBuilders/joins/selectJoinBuilder';
import Order from '../highLvlBuilders/order';
// eslint-disable-next-line import/no-cycle
import Join from '../joinBuilders/join';
import Expr from '../requestBuilders/where/where';
import Aggregator from './abstractAggregator';

export default class SelectAggregator extends Aggregator {
  private _from: Array<string> = [];
  private _filters: Array<string> = [];
  private _select: Array<string> = ['SELECT'];
  private _join: Array<string> = [];
  private _limit: Array<string> = [];
  private _offset: Array<string> = [];
  private _distinct: Array<string> = [];
  // private _groupBy: Array<string> = [];
  private _orderBy: Array<string> = [];
  private _values: Array<any> = [];

  private _joinCache: {[tableName: string]: string} = {};

  public constructor(table: AbstractTable<any>, partial?: {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, AbstractTable<any>>}) {
    super(table, partial);
  }

  public filters = (filters: Expr): SelectAggregator => {
    if (filters) {
      const queryBuilder = filters.toQuery({ position: this._values.length + 1, session: this._table.db.session() });
      this._filters.push('WHERE ');
      this._filters.push(queryBuilder.query);
      this._values.push(...queryBuilder.values);
    }
    return this;
  };

  public limit = (limit?: number): SelectAggregator => {
    if (limit) {
      this._limit.push('LIMIT ');
      this._limit.push(limit.toString());
    }
    return this;
  };

  public offset = (offset?: number): SelectAggregator => {
    if (offset) {
      this._offset.push('OFFSET ');
      this._offset.push(offset.toString());
    }
    return this;
  };

  public orderBy = (column?: AbstractColumn<ColumnType, boolean, boolean>,
    order?: Order): SelectAggregator => {
    if (column !== null && column !== undefined) {
      this._orderBy.push('ORDER BY ');
      const columnParent = this._joinCache[column.getParent().tableName()] ? this._joinCache[column.getParent().tableName()] : column.getParent().tableName();
      this._orderBy.push(`${columnParent}.${escape(column.getColumnName(), this._table.db.session().escapeStrategy())} `);
      this._orderBy.push(Order[order!]);
    }
    return this;
  };

  public distinct = (column?: AbstractColumn<ColumnType, boolean, boolean>): SelectAggregator => {
    if (column) {
      this._distinct.push(` DISTINCT ON(${column.getParent().tableName()}.${escape(column.getColumnName(), this._table.db.session().escapeStrategy())}) `);
    }
    return this;
  };

  public appendFrom = (tableName: string): SelectAggregator => {
    this._from.push('FROM ');
    this._from.push(tableName);
    // this._from.push(`${tableName} AS ${tableName}_0`);
    // this._joinCache[tableName] = tableName;
    return this;
  };

  public join = (joins: Array<JoinType<AbstractTable<any>>>): SelectAggregator => {
    const tableFrom = this._table.tableName();

    for (const [index, join] of joins.entries()) {
      const {
        table: tableToName, originalName, onExpression, type, columns,
      } = join;

      const selectString = this.generateSelectArray(tableToName, Object.values(columns)).join('');
      this._fields.push(', ');
      this._fields.push(selectString);
      this._join.push('\n');
      this._join.push(type);
      this._join.push(' ');
      this._join.push(originalName);
      this._join.push(' ');
      this._join.push(`AS ${tableToName}`);
      this._join.push('\n');
      this._join.push('ON ');

      const joinExpr = onExpression.toQuery({ position: this._values.length + 1, session: this._table.db.session() });
      this._values.push(...joinExpr.values);

      this._join.push(joinExpr.query);
    }
    return this;
  };

  public buildQuery = (): { query: string, values: Array<any> } => {
    this._select.push(this._distinct.join(''));
    this._select.push(this._fields.join(''));
    this._select.push('\n');
    this._select.push(this._from.join(''));
    this._select.push('\n');
    this._select.push(this._join.join(''));
    if (this._join.length > 0) {
      this._select.push('\n');
    }
    this._select.push(this._filters.join(''));
    this._select.push('\n');
    this._select.push(this._orderBy.join(''));
    this._select.push('\n');
    this._select.push(this._limit.join(''));
    this._select.push('\n');
    this._select.push(this._offset.join(''));

    return { query: this._select.join(''), values: this._values };
  };
}
