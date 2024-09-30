import { getCollisions, Table } from './utils';

export class ValidateTable {
  constructor(private errors: string[], private schema: string | undefined, private name: string) {}

  columnNameCollisions(tableColumns: Table['columns']) {
    const columnNames = tableColumns.map((c) => c.name);
    const collisions = getCollisions(columnNames);
    const messages = collisions.map(
      (name) => `Table ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has duplicate column "${name}"`
    );
    this.errors.push(...messages);
    return this;
  }
}