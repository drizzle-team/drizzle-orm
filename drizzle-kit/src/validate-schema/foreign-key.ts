import { SchemaValidationErrors } from './errors';
import { Table } from './utils';

export class ValidateForeignKey {
  constructor(private errors: string[], private errorCodes: Set<number>, private schema: string | undefined, private name: string) {}

  mismatchingColumnCount(foreignKey: Table['foreignKeys'][number]) {
    const { columns, foreignColumns }  = foreignKey.reference;

    if (columns.length !== foreignColumns.length) {
      this.errors.push(`Foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has ${columns.length.toString()} column${columns.length === 1 ? '' : 's'} but references ${foreignColumns.length.toString()}`);
      this.errorCodes.add(SchemaValidationErrors.ForeignKeyMismatchingColumnCount);
    }

    return this;
  }

  mismatchingDataTypes(foreignKey: Table['foreignKeys'][number]) {
    const { columns, foreignColumns }  = foreignKey.reference;

    const types = `(${columns.map((c) => c.getSQLType()).join(', ')})`;
    const foreignTypes = `(${foreignColumns.map((c) => c.getSQLType()).join(', ')})`;

    if (types !== foreignTypes) {
      this.errors.push(`Column data types in foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" do not match. Types ${types} are different from ${foreignTypes}`);
      this.errorCodes.add(SchemaValidationErrors.ForeignKeyMismatchingDataTypes);
    }

    return this;
  }

  /** Only applies to composite foreign keys */
  columnsMixingTables(foreignKey: Table['foreignKeys'][number]) {
    const { columns, foreignColumns }  = foreignKey.reference;

    if (columns.length < 1 || foreignColumns.length < 1) {
      return this;
    }

    let acc = new Set<string>();
    for (const column of columns) {
      const table = column.table;
      const name = `${table.schema ? `"${table.schema}".` : ''}"${table.name}"`;
      acc.add(name);
    }

    if (acc.size > 1) {
      this.errors.push(`Composite foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has columns from multiple tables`);
      this.errorCodes.add(SchemaValidationErrors.ForeignKeyColumnsMixingTables);
    }

    acc = new Set<string>();
    for (const column of foreignColumns) {
      const table = column.table;
      const name = `${table.schema ? `"${table.schema}".` : ''}"${table.name}"`;
      acc.add(name);
    }

    if (acc.size > 1) {
      this.errors.push(`Composite foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" references columns from multiple tables`);
      this.errorCodes.add(SchemaValidationErrors.ForeignKeyForeignColumnsMixingTables);
    }

    return this;
  }
}