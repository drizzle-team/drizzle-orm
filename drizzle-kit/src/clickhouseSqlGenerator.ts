import type { JsonClickHouseStatement } from './clickhouseStatements';
import type { Column, Engine, Index, Projection, Table } from './serializer/clickhouseSchema';

/** Wraps an identifier in backticks, escaping backslashes and backticks. */
export function escapeIdentifier(value: string): string {
	return `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``;
}

/** Wraps a string in single quotes, escaping backslashes and quotes. */
export function escapeString(value: string): string {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function qualifiedName(schema: string, tableName: string): string {
	return schema && schema.length > 0
		? `${escapeIdentifier(schema)}.${escapeIdentifier(tableName)}`
		: escapeIdentifier(tableName);
}

/**
 * Renders a column's definition.
 *
 * ClickHouse expects the clauses in this order:
 * `name Type [DEFAULT|MATERIALIZED|ALIAS|EPHEMERAL expr] [COMMENT] [CODEC] [TTL]`.
 */
export function columnDefinition(column: Column): string {
	const parts: string[] = [`${escapeIdentifier(column.name)} ${column.type}`];

	if (column.materialized !== undefined) {
		parts.push(`MATERIALIZED ${column.materialized}`);
	} else if (column.alias !== undefined) {
		parts.push(`ALIAS ${column.alias}`);
	} else if (column.ephemeral) {
		parts.push(column.default === undefined ? 'EPHEMERAL' : `EPHEMERAL ${column.default}`);
	} else if (column.default !== undefined) {
		parts.push(`DEFAULT ${column.default}`);
	}

	if (column.comment !== undefined) {
		parts.push(`COMMENT ${escapeString(column.comment)}`);
	}

	if (column.codec !== undefined) {
		parts.push(`CODEC(${column.codec})`);
	}

	if (column.ttl !== undefined) {
		parts.push(`TTL ${column.ttl}`);
	}

	return parts.join(' ');
}

export function indexDefinition(index: Index): string {
	return `INDEX ${escapeIdentifier(index.name)} ${index.expression} TYPE ${index.type} GRANULARITY ${
		index.granularity ?? '1'
	}`;
}

export function projectionDefinition(projection: Projection): string {
	return `PROJECTION ${escapeIdentifier(projection.name)} (${projection.query})`;
}

/** Renders `ENGINE = …` followed by the clauses ClickHouse expects after it, in order. */
export function engineDefinition(engine: Engine): string {
	const parts: string[] = [
		engine.args.length > 0 ? `ENGINE = ${engine.name}(${engine.args.join(', ')})` : `ENGINE = ${engine.name}`,
	];

	if (engine.partitionBy) parts.push(`PARTITION BY ${engine.partitionBy}`);
	if (engine.orderBy) parts.push(`ORDER BY ${engine.orderBy}`);
	if (engine.primaryKey) parts.push(`PRIMARY KEY ${engine.primaryKey}`);
	if (engine.sampleBy) parts.push(`SAMPLE BY ${engine.sampleBy}`);
	if (engine.ttl) parts.push(`TTL ${engine.ttl}`);

	const settings = Object.entries(engine.settings ?? {});
	if (settings.length > 0) {
		parts.push(`SETTINGS ${settings.map(([name, value]) => `${name} = ${value}`).join(', ')}`);
	}

	return parts.join(' ');
}

export function createTableStatement(table: Table): string {
	const entries: string[] = [
		...Object.values(table.columns).map((column) => `\t${columnDefinition(column)}`),
		...Object.values(table.indexes).map((index) => `\t${indexDefinition(index)}`),
		...Object.values(table.projections).map((projection) => `\t${projectionDefinition(projection)}`),
	];

	return `CREATE TABLE ${qualifiedName(table.schema, table.name)} (\n${entries.join(',\n')}\n)\n${
		engineDefinition(table.engine)
	};`;
}

/** Converts one statement into the SQL that applies it. */
export function convertStatement(statement: JsonClickHouseStatement): string[] {
	switch (statement.type) {
		case 'ch_create_table': {
			return [createTableStatement(statement.table)];
		}

		case 'ch_drop_table': {
			return [`DROP TABLE ${qualifiedName(statement.schema, statement.tableName)};`];
		}

		case 'ch_rename_table': {
			return [
				`RENAME TABLE ${qualifiedName(statement.fromSchema, statement.tableNameFrom)} TO ${
					qualifiedName(statement.toSchema, statement.tableNameTo)
				};`,
			];
		}

		case 'ch_add_column': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} ADD COLUMN ${
					columnDefinition(statement.column)
				};`,
			];
		}

		case 'ch_drop_column': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} DROP COLUMN ${
					escapeIdentifier(statement.columnName)
				};`,
			];
		}

		case 'ch_rename_column': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} RENAME COLUMN ${
					escapeIdentifier(statement.oldColumnName)
				} TO ${escapeIdentifier(statement.newColumnName)};`,
			];
		}

		case 'ch_alter_column': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} MODIFY COLUMN ${
					columnDefinition(statement.column)
				};`,
			];
		}

		case 'ch_add_index': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} ADD ${indexDefinition(statement.index)};`,
			];
		}

		case 'ch_drop_index': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} DROP INDEX ${
					escapeIdentifier(statement.indexName)
				};`,
			];
		}

		case 'ch_add_projection': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} ADD ${
					projectionDefinition(statement.projection)
				};`,
			];
		}

		case 'ch_drop_projection': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} DROP PROJECTION ${
					escapeIdentifier(statement.projectionName)
				};`,
			];
		}

		case 'ch_modify_ttl': {
			const table = qualifiedName(statement.schema, statement.tableName);
			return [
				statement.ttl === undefined
					? `ALTER TABLE ${table} REMOVE TTL;`
					: `ALTER TABLE ${table} MODIFY TTL ${statement.ttl};`,
			];
		}

		case 'ch_modify_settings': {
			const settings = Object.entries(statement.settings)
				.map(([name, value]) => `${name} = ${value}`)
				.join(', ');
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} MODIFY SETTING ${settings};`,
			];
		}

		case 'ch_modify_order_by': {
			return [
				`ALTER TABLE ${qualifiedName(statement.schema, statement.tableName)} MODIFY ORDER BY ${statement.orderBy};`,
			];
		}

		case 'ch_recreate_table': {
			// The engine and its keys are immutable, so the table has to be rebuilt. Data is not carried
			// over — the CLI surfaces this as a data-loss warning before anything runs.
			const name = qualifiedName(statement.table.schema, statement.table.name);
			return [
				`DROP TABLE ${name};`,
				createTableStatement(statement.table),
			];
		}
	}
}

export function fromJson(statements: JsonClickHouseStatement[]): string[] {
	return statements.flatMap((statement) => convertStatement(statement));
}
