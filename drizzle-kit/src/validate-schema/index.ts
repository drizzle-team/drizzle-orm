import { is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Table } from './utils';

export class ValidateIndex {
  constructor(private errors: string[], private schema: string | undefined, private name: string) {}

  /** PG only */
  requiresName(columns: Table['indexes'][number]['columns'], dialect: PgDialect) {
    for (const column of columns) {
      if (is(column, SQL)) {
        this.errors.push(`Cannot automatically assign name to index in table ${this.schema ? `"${this.schema}".` : ''}"${this.name}" with expression \`${dialect.sqlToQuery(column).sql}\`. Please assign a name manually`);
        break;
      }
    }

    return this;
  }

  /** PG only */
  vectorColumnRequiresOp(columns: Table['indexes'][number]['columns']) {
    for (const column of columns) {
      if (!is(column, SQL) && column.type === 'PgVector' && column.op === undefined) {
        this.errors.push(`Column "${column.name}" in index ${this.schema ? `"${this.schema}".` : ''}"${this.name}" requires an operator class`);
      }
    }

    return this;
  }
}
