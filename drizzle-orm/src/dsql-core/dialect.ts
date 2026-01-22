import { CasingCache } from '~/casing.ts';
import { entityKind } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { type QueryWithTypings, SQL } from '~/sql/sql.ts';
import type { Casing } from '~/utils.ts';
import type { DSQLDeleteConfig } from './query-builders/delete.ts';
import type { DSQLInsertConfig } from './query-builders/insert.ts';
import type { DSQLSelectConfig } from './query-builders/select.types.ts';
import type { DSQLUpdateConfig } from './query-builders/update.ts';
import type { DSQLSession } from './session.ts';

export interface DSQLDialectConfig {
	casing?: Casing;
}

export class DSQLDialect {
	static readonly [entityKind]: string = 'DSQLDialect';

	/** @internal */
	readonly casing: CasingCache;

	constructor(config?: DSQLDialectConfig) {
		this.casing = new CasingCache(config?.casing);
	}

	async migrate(
		migrations: MigrationMeta[],
		session: DSQLSession,
		config: Omit<MigrationConfig, 'migrationsSchema'>,
	): Promise<void> {
		throw new Error('Method not implemented.');
	}

	escapeName(name: string): string {
		// PostgreSQL-style double-quote identifier escaping
		return `"${name}"`;
	}

	escapeParam(num: number): string {
		// PostgreSQL-style positional parameter (1-indexed)
		return `$${num + 1}`;
	}

	escapeString(str: string): string {
		return `'${str.replace(/'/g, "''")}'`;
	}

	buildDeleteQuery(config: DSQLDeleteConfig): SQL {
		throw new Error('Method not implemented.');
	}

	buildUpdateSet(table: any, set: any): SQL {
		throw new Error('Method not implemented.');
	}

	buildUpdateQuery(config: DSQLUpdateConfig): SQL {
		throw new Error('Method not implemented.');
	}

	buildSelectQuery(config: DSQLSelectConfig): SQL {
		throw new Error('Method not implemented.');
	}

	buildSetOperations(leftSelect: SQL, setOperators: DSQLSelectConfig['setOperators']): SQL {
		throw new Error('Method not implemented.');
	}

	buildInsertQuery(config: DSQLInsertConfig): { sql: SQL; generatedIds: Record<string, unknown>[] } {
		throw new Error('Method not implemented.');
	}

	sqlToQuery(sql: SQL, invokeSource?: 'indexes' | undefined): QueryWithTypings {
		return sql.toQuery({
			casing: this.casing,
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			invokeSource,
		});
	}

	buildRelationalQuery(config: {
		schema: any;
		table: any;
		tableConfig: any;
		queryConfig?: any;
		relationWhere?: SQL;
		mode: 'first' | 'many';
	}): { sql: SQL; selection: any[] } {
		throw new Error('Method not implemented.');
	}
}
