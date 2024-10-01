import { SchemaValidationErrors } from './errors';
import { getCollisions, Table } from './utils';

export class ValidateTable {
  constructor(private errors: string[], private errorCodes: Set<number>, private schema: string | undefined, private name: string) {}

  columnNameCollisions(tableColumns: Table['columns']) {
    const columnNames = tableColumns.map((c) => c.name);
    const collisions = getCollisions(columnNames);

    if (collisions.length > 0) {
      const messages = collisions.map(
        (name) => `Table ${this.schema ? `"${this.schema}".` : ''}"${this.name}" has duplicate column "${name}"`
      );
      this.errors.push(...messages);
      this.errorCodes.add(SchemaValidationErrors.TableColumnNameCollisions);
    }

    return this;
  }
}