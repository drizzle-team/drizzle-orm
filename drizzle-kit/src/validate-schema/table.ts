import { CasingType } from 'src/cli/validations/common';
import { SchemaValidationErrors, ValidationError } from './errors';
import { entityName, fmtValue, getCollisions, Table } from './utils';

export class ValidateTable {
	constructor(
		private errors: ValidationError[],
		private errorCodes: Set<number>,
		private schema: string | undefined,
		private name: string,
	) {}

	columnNameCollisions(tableColumns: Table['columns'], casing: CasingType | undefined) {
		const columnNames = tableColumns.map((c) => c.name);
		const collisions = getCollisions(columnNames);

		if (collisions.length > 0) {
			let hint = 'Each column in a table must have a unique name. Rename any of the conflicting columns';
			const example = [fmtValue('firstName', true), fmtValue('first_name', true)];

			if (casing !== undefined) {
				hint += `.\nRemember that you configured Drizzle to use ${
					casing === 'camelCase' ? 'camel' : 'snake'
				} case, which means that columns without an explicit alias will be transformed. Example: ${
					(casing === 'camelCase' ? example.reverse() : example).join(fmtValue(' -> ', false))
				}`;
			}

			const errors: ValidationError[] = collisions.map(
				(name) => ({
					message: `Table ${entityName(this.schema, this.name, true)} has duplicate column ${fmtValue(name, true)}`,
					hint,
				}),
			);
			this.errors.push(...errors);
			this.errorCodes.add(SchemaValidationErrors.TableColumnNameCollisions);
		}

		return this;
	}
}
