import { Table } from './utils';

export class ValidateForeignKey {
  constructor(private errors: string[], private schema: string | undefined, private name: string) {}

  mismatchingColumnCount(foreignKey: Table['foreignKeys'][number]) {
    const { columns, foreignColumns }  = foreignKey.reference;

    if (columns.length !== foreignColumns.length) {
      this.errors.push(`Foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has ${columns.length.toString()} column${columns.length === 1 ? '' : 's'} but references ${foreignColumns.length.toString()}`);
    }

    return this;
  }

  mismatchingDataTypes(foreignKey: Table['foreignKeys'][number]) {
    const { columns, foreignColumns }  = foreignKey.reference;

    const types = `(${columns.map((c) => c.getSQLType()).join(', ')})`;
    const foreignTypes = `(${foreignColumns.map((c) => c.getSQLType()).join(', ')})`;

    if (types !== foreignTypes) {
      this.errors.push(`Column data types in foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" do not match. Types ${types} are different from ${foreignTypes}`);
    }

    return this;
  }

  /** Only applies to composite foreign keys */
  columnsMixingTables(foreignKey: Table['foreignKeys'][number], tables: Pick<Table, 'columns' | 'schema' | 'name'>[]) {
    const { columns, foreignColumns }  = foreignKey.reference;

    if (columns.length < 1 || foreignColumns.length < 1) {
      return this;
    }

    let acc = new Set<string>();
    for (const column of columns) {
      const table = tables.find((t) => t.columns.find((c) => c.name === column.name))!;
      const name = `${table.schema ? `"${table.schema}".` : ''}"${table.name}"`;

      if (!acc.has(name)) {
        this.errors.push(`Composite foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has columns from multiple tables`);
        break;
      }

      acc.add(name);
    }

    acc = new Set<string>();
    for (const column of foreignColumns) {
      const table = tables.find((t) => t.columns.find((c) => c.name === column.name))!;
      const name = `${table.schema ? `"${table.schema}".` : ''}"${table.name}"`;

      if (!acc.has(name)) {
        this.errors.push(`Composite foreign key ${this.schema ? `"${this.schema}".` : ''}"${this.name}" references columns from multiple tables`);
        break;
      }

      acc.add(name);
    }

    return this;
  }
}