import type { DSQLDialect } from '~/dsql-core/dialect.ts';
import type { DSQLTable } from '~/dsql-core/table.ts';
import { entityKind } from '~/entity.ts';
import type { BuildQueryResult, DBQueryConfig, TableRelationalConfig, TablesRelationalConfig } from '~/relations.ts';
import type { KnownKeysOnly } from '~/utils.ts';
import {
	DSQLRelationalQuery,
	type DSQLRelationalQueryConstructor,
	type DSQLRelationalQueryHKT,
	type DSQLRelationalQueryHKTBase,
	type DSQLRelationalQueryKind,
} from './query.ts';
import type { DSQLDriverSession } from './session.ts';

export class DSQLRelationalQueryBuilder<
	TSchema extends TablesRelationalConfig,
	TFields extends TableRelationalConfig,
	TBuilderHKT extends DSQLRelationalQueryHKTBase = DSQLRelationalQueryHKT,
> {
	static readonly [entityKind]: string = 'DSQLRelationalQueryBuilder';

	constructor(
		private schema: TSchema,
		private table: DSQLTable,
		private tableConfig: TableRelationalConfig,
		private dialect: DSQLDialect,
		private session: DSQLDriverSession<any, any, any>,
		private parseJson: boolean,
		private builder: DSQLRelationalQueryConstructor = DSQLRelationalQuery,
	) {}

	findMany<TConfig extends DBQueryConfig<'many', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', TSchema, TFields>>,
	): DSQLRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig>[]> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'many'> | undefined ?? true,
			'many',
			this.parseJson,
		) as DSQLRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig>[]>;
	}

	findFirst<TConfig extends DBQueryConfig<'one', TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>,
	): DSQLRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig> | undefined> {
		return new this.builder(
			this.schema,
			this.table,
			this.tableConfig,
			this.dialect,
			this.session,
			config as DBQueryConfig<'one'> | undefined ?? true,
			'first',
			this.parseJson,
		) as DSQLRelationalQueryKind<TBuilderHKT, BuildQueryResult<TSchema, TFields, TConfig> | undefined>;
	}
}
