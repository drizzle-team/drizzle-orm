import { Dialect } from 'drizzle-orm';
import { SchemaValidationErrors, ValidationError } from './errors';
import { entityName, fmtValue, Table } from './utils';

export class ValidateForeignKey {
	constructor(
		private errors: ValidationError[],
		private errorCodes: Set<number>,
		private schema: string | undefined,
		private name: string,
	) {}

	mismatchingColumnCount(foreignKey: Table['foreignKeys'][number]) {
		const { columns, foreignColumns } = foreignKey.reference;

		if (columns.length !== foreignColumns.length) {
			this.errors.push({
				message: `Foreign key ${entityName(this.schema, this.name, true)} has ${
					fmtValue(columns.length.toString(), false)
				} column${columns.length === 1 ? '' : 's'} but references ${fmtValue(foreignColumns.length.toString(), false)}`,
				hint: 'The amount of columns in the foreign key must match the amount of referenced columns',
			});
			this.errorCodes.add(SchemaValidationErrors.ForeignKeyMismatchingColumnCount);
		}

		return this;
	}

	mismatchingDataTypes(foreignKey: Table['foreignKeys'][number], dialect: Dialect) {
		const { columns, foreignColumns } = foreignKey.reference;

		const typeAliases: Record<string, string> = {
			serial: dialect === 'mysql' ? 'bigint unsigned' : 'integer',
			bigserial: 'bigint',
			smallserial: 'smallint',
		};
		const typeAliasesUsed: Record<string, boolean> = Object.keys(typeAliases).reduce(
			(acc, type) => ({ ...acc, [type]: false }),
			{},
		);

		const map = (c: { sqlType: string }) => {
			if (typeAliases[c.sqlType]) {
				typeAliasesUsed[c.sqlType] = true;
				return typeAliases[c.sqlType];
			}
			return c.sqlType;
		};

		const types = `(${columns.map(map).join(', ')})`;
		const foreignTypes = `(${foreignColumns.map(map).join(', ')})`;

		if (types !== foreignTypes) {
			let hint = `Type${columns.length > 1 ? 's' : ''} ${fmtValue(types, false)} ${
				columns.length > 1 ? 'are' : 'is'
			} different from ${fmtValue(foreignTypes, false)}. The data types must be the same`;

			const usedAliases = Object.values(typeAliasesUsed).filter((used) => used);

			if (usedAliases.length > 0) {
				const list = Object.entries(typeAliasesUsed).map(([type]) => {
					return `${fmtValue(type, false)} is an alias for ${fmtValue(typeAliases[type], false)}`;
				});
				const listStr = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.slice(-1)}` : list[0];
				hint += `.\nRemember that ${listStr}`;
			}

			this.errors.push({
				message: `Column data types in foreign key ${entityName(this.schema, this.name, true)} do not match`,
				hint,
			});
			this.errorCodes.add(SchemaValidationErrors.ForeignKeyMismatchingDataTypes);
		}

		return this;
	}

	/** Only applies to composite foreign keys */
	columnsMixingTables(foreignKey: Table['foreignKeys'][number]) {
		const { columns, foreignColumns } = foreignKey.reference;

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
			this.errors.push({
				message: `Composite foreign key ${entityName(this.schema, this.name, true)} has columns from multiple tables`,
				hint: 'Each column in a foreign key must be from the same table',
			});
			this.errorCodes.add(SchemaValidationErrors.ForeignKeyColumnsMixingTables);
		}

		acc = new Set<string>();
		for (const column of foreignColumns) {
			const table = column.table;
			const name = `${table.schema ? `"${table.schema}".` : ''}"${table.name}"`;
			acc.add(name);
		}

		if (acc.size > 1) {
			this.errors.push({
				message: `Composite foreign key ${
					entityName(this.schema, this.name, true)
				} references columns from multiple tables`,
				hint: 'Each reference column in a foreign key must be from the same table',
			});
			this.errorCodes.add(SchemaValidationErrors.ForeignKeyForeignColumnsMixingTables);
		}

		return this;
	}
}
