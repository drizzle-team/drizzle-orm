import { SchemaValidationErrors, ValidationError } from './errors';
import { entityName, Table } from './utils';

export class ValidatePrimaryKey {
	constructor(
		private errors: ValidationError[],
		private errorCodes: Set<number>,
		private schema: string | undefined,
		private name: string,
	) {}

	/** Only applies to composite primary keys */
	columnsMixingTables(primaryKey: Table['primaryKeys'][number]) {
		if (primaryKey.columns.length < 1) {
			return this;
		}

		const acc = new Set<string>();
		for (const column of primaryKey.columns) {
			const name = entityName(column.table.schema, column.table.name);
			acc.add(name);
		}

		if (acc.size > 1) {
			this.errors.push({
				message: `Composite primary key ${entityName(this.schema, this.name, true)} has columns from multiple tables`,
				hint: 'Each column in a primary key must be from the same table',
			});
			this.errorCodes.add(SchemaValidationErrors.PrimaryKeyColumnsMixingTables);
		}

		return this;
	}
}
