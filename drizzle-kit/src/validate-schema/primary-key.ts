import { SchemaValidationErrors } from './errors';
import { Table } from './utils';

export class ValidatePrimaryKey {
  constructor(private errors: string[], private errorCodes: Set<number>, private schema: string | undefined, private name: string) {}

  /** Only applies to composite primary keys */
  columnsMixingTables(primaryKey: Table['primaryKeys'][number]) {
    if (primaryKey.columns.length < 1) {
      return this;
    }

    const acc = new Set<string>();
    for (const column of primaryKey.columns) {
      const table = column.table;
      const name = `${table.schema ? `"${table.schema}".` : ''}"${table.name}"`;
      acc.add(name);
    }

    if (acc.size > 1) {
      this.errors.push(`Composite primary key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has columns from multiple tables`);
      this.errorCodes.add(SchemaValidationErrors.PrimaryKeyColumnsMixingTables);
    }

    return this;
  }
}