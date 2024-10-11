import { ValidateIndex } from '.';
import { ValidateEnum } from './enum';
import { SchemaValidationErrors, ValidationError } from './errors';
import { ValidateForeignKey } from './foreign-key';
import { ValidatePrimaryKey } from './primary-key';
import { ValidateSequence } from './sequence';
import { ValidateTable } from './table';
import { entityName, Enum, fmtValue, getCollisions, listStr, MaterializedView, Sequence, Table, View } from './utils';

export class ValidateSchema {
	constructor(private errors: ValidationError[], private errorCodes: Set<number>, private schema: string | undefined) {}

	validateEnum(enumName: string) {
		return new ValidateEnum(this.errors, this.errorCodes, this.schema, enumName);
	}

	validateSequence(sequenceName: string) {
		return new ValidateSequence(this.errors, this.errorCodes, this.schema, sequenceName);
	}

	validateTable(tableName: string) {
		return new ValidateTable(this.errors, this.errorCodes, this.schema, tableName);
	}

	validateForeignKey(foreignKeyName: string) {
		return new ValidateForeignKey(this.errors, this.errorCodes, this.schema, foreignKeyName);
	}

	validatePrimaryKey(primaryKeyName: string) {
		return new ValidatePrimaryKey(this.errors, this.errorCodes, this.schema, primaryKeyName);
	}

	validateIndex(indexName: string) {
		return new ValidateIndex(this.errors, this.errorCodes, this.schema, indexName);
	}

	entityNameCollisions(
		tables: Pick<Table, 'name'>[],
		views: View[],
		materializedViews: MaterializedView[],
		enums: Enum[],
		sequences: Sequence[],
	) {
		const names = [
			...tables.map((t) => t.name),
			...views.map((v) => v.name),
			...materializedViews.map((mv) => mv.name),
			...enums.map((e) => e.enumName),
			...sequences.filter((s) => !!s.seqName).map((s) => s.seqName) as string[],
		];

		const collisions = getCollisions(names);

		if (collisions.length > 0) {
			const messages: ValidationError[] = collisions.map((name) => {
				const inTables = tables.filter((t) => t.name === name).length;
				const inViews = views.filter((v) => v.name === name).length;
				const inMaterializedViews = materializedViews.filter((mv) => mv.name === name).length;
				const inEnums = enums.filter((e) => e.enumName === name).length;
				const inSequences = sequences.filter((s) => s.seqName === name).length;

				const list = listStr(
					[inTables, 'table', 'tables'],
					[inViews, 'view', 'views'],
					[inMaterializedViews, 'materialized view', 'materialized views'],
					[inEnums, 'enum', 'enums'],
					[inSequences, 'sequence', 'sequences'],
				);

				return {
					message: `${
						this.schema
							? `In schema ${entityName(undefined, this.schema, true)}, ${list} have `
							: `Database has ${list} with `
					}the same name, ${fmtValue(name, true)}`,
					hint:
						'Each entity (table, view, materialized view, enum and sequence) in a schema must have a unique name. Rename any of the conflicting entities',
				};
			});

			this.errors.push(...messages);
			this.errorCodes.add(SchemaValidationErrors.SchemaEntityNameCollisions);
		}

		return this;
	}

	constraintNameCollisions(
		indexes: Table['indexes'],
		foreignKeys: Table['foreignKeys'],
		checks: Table['checks'],
		primaryKeys: Table['primaryKeys'],
		uniqueConstraints: Table['uniqueConstraints'],
	) {
		const names = [
			...indexes.map((i) => i.name),
			...foreignKeys.map((f) => f.name),
			...checks.map((c) => c.name),
			...primaryKeys.map((p) => p.name),
			...uniqueConstraints.map((u) => u.name),
		];

		const collisions = getCollisions(names);

		if (collisions.length > 0) {
			const messages: ValidationError[] = collisions.map((name) => {
				const inIndexes = indexes.filter((i) => i.name === name).length;
				const inForeignKeys = foreignKeys.filter((f) => f.name === name).length;
				const inChecks = checks.filter((c) => c.name === name).length;
				const inPrimaryKeys = primaryKeys.filter((p) => p.name === name).length;
				const inUniqueConstraints = uniqueConstraints.filter((u) => u.name === name).length;

				const list = listStr(
					[inIndexes, 'index', 'indexes'],
					[inForeignKeys, 'foreign key', 'foreign keys'],
					[inChecks, 'check', 'checks'],
					[inPrimaryKeys, 'primary key', 'primary keys'],
					[inUniqueConstraints, 'unique constraint', 'unique constraints'],
				);

				return {
					message: `${
						this.schema
							? `In schema ${entityName(undefined, this.schema, true)}, ${list} have `
							: `Database has ${list} with `
					}the same name, ${fmtValue(name, true)}`,
					hint:
						'Each constraint (primary key, foreign key, check and unique) and index in a schema must have a unique name. Rename any of the conflicting constraints/indexes',
				};
			});

			this.errors.push(...messages);
			this.errorCodes.add(SchemaValidationErrors.SchemaConstraintNameCollisions);
		}

		return this;
	}
}
