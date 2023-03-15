import type { SQL } from '~/sql';
import { SelectionProxyHandler } from '~/subquery';
import type { Assume } from '~/utils';
import { View } from '~/view';
import type { AnyPgColumnBuilder, BuildColumns } from './columns/common';
import type { QueryBuilder, QueryBuilderInstance } from './query-builders';
import { queryBuilder } from './query-builders';
import type { AddAliasToSelection, SelectFields } from './query-builders/select.types';
import { pgTable } from './table';
import { getTableColumns } from './utils';

export interface ViewBuilderHKTBase {
	name: string;
	columns: unknown;
	excludedMethods: string;
	$type: unknown;
}

export interface ViewBuilderHKT extends ViewBuilderHKTBase {
	$type: ViewBuilder<this['name'], this['excludedMethods']>;
}

export interface ManualViewBuilderHKT extends ViewBuilderHKTBase {
	$type: ManualViewBuilder<this['name'], Assume<this['columns'], Record<string, AnyPgColumnBuilder>>>;
}

export interface MaterializedViewBuilderHKT extends ViewBuilderHKTBase {
	$type: MaterializedViewBuilder<this['name'], this['excludedMethods']>;
}

export interface ManualMaterializedViewBuilderHKT extends ViewBuilderHKTBase {
	$type: ManualMaterializedViewBuilder<this['name'], Assume<this['columns'], Record<string, AnyPgColumnBuilder>>>;
}

export type ViewBuilderKind<
	T extends ViewBuilderHKTBase,
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
> = (T & {
	name: TConfig['name'];
	columns: TConfig['columns'];
	excludedMethods: TConfig['excludedMethods'];
})['$type'];

export interface ViewWithConfig {
	checkOption: 'local' | 'cascaded';
	securityBarrier: boolean;
	securityInvoker: boolean;
}

export type ViewBuilderWithFilteredMethods<
	THKT extends ViewBuilderHKTBase,
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
	TNewExcludedMethods extends string,
> = Omit<
	ViewBuilderKind<THKT, TConfig & { excludedMethods: TConfig['excludedMethods'] | TNewExcludedMethods }>,
	TConfig['excludedMethods'] | TNewExcludedMethods
>;

export class DefaultViewBuilderCore<
	THKT extends ViewBuilderHKTBase,
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
> {
	declare protected $config: TConfig;

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: {
		with?: ViewWithConfig;
	} = {};

	with(config: ViewWithConfig): ViewBuilderWithFilteredMethods<THKT, TConfig, 'with'> {
		this.config.with = config;
		return this;
	}
}

export class ViewBuilder<TName extends string = string, TExcludedMethods extends string = never>
	extends DefaultViewBuilderCore<ViewBuilderHKT, { name: TName; excludedMethods: TExcludedMethods }>
{
	as<TSelection extends SelectFields>(
		qb: QueryBuilder<TSelection> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelection>),
	): PgViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>> {
		if (typeof qb === 'function') {
			qb = qb(queryBuilder);
		}
		const selectionProxy = new SelectionProxyHandler<TSelection>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
		});
		const aliasedSelection = new Proxy(qb.getSelection(), selectionProxy);
		return new Proxy(
			new PgView({
				pgConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selection: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as PgViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyPgColumnBuilder> = Record<string, AnyPgColumnBuilder>,
	TExcludedMethods extends string = never,
> extends DefaultViewBuilderCore<
	ManualViewBuilderHKT,
	{ name: TName; columns: TColumns; excludedMethods: TExcludedMethods }
> {
	private columns: BuildColumns<TName, TColumns>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTable(name, columns)) as BuildColumns<TName, TColumns>;
	}

	existing(): PgViewWithSelection<TName, true, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new PgView({
				pgConfig: undefined,
				config: {
					name: this.name,
					schema: this.schema,
					selection: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
			}),
		) as PgViewWithSelection<TName, true, BuildColumns<TName, TColumns>>;
	}

	as(query: SQL): PgViewWithSelection<TName, false, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new PgView({
				pgConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selection: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
			}),
		) as PgViewWithSelection<TName, false, BuildColumns<TName, TColumns>>;
	}
}

export interface PgMaterializedViewWithConfig {
	[Key: string]: string | number | boolean | SQL;
}

export class MaterializedViewBuilderCore<
	THKT extends ViewBuilderHKTBase,
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
> {
	declare protected $config: TConfig;

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: {
		with?: PgMaterializedViewWithConfig;
		using?: string;
		tablespace?: string;
		withNoData?: boolean;
	} = {};

	using(using: string): ViewBuilderWithFilteredMethods<THKT, TConfig, 'using'> {
		this.config.using = using;
		return this;
	}

	with(config: PgMaterializedViewWithConfig): ViewBuilderWithFilteredMethods<THKT, TConfig, 'with'> {
		this.config.with = config;
		return this;
	}

	tablespace(tablespace: string): ViewBuilderWithFilteredMethods<THKT, TConfig, 'tablespace'> {
		this.config.tablespace = tablespace;
		return this;
	}

	withNoData(): ViewBuilderWithFilteredMethods<THKT, TConfig, 'withNoData'> {
		this.config.withNoData = true;
		return this;
	}
}

export class MaterializedViewBuilder<TName extends string = string, TExcludedMethods extends string = never>
	extends MaterializedViewBuilderCore<
		MaterializedViewBuilderHKT,
		{ name: TName; excludedMethods: TExcludedMethods }
	>
{
	declare protected $excludedMethods: TExcludedMethods;

	as<TSelection extends SelectFields>(
		qb: QueryBuilder<TSelection> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelection>),
	): PgMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>> {
		if (typeof qb === 'function') {
			qb = qb(queryBuilder);
		}
		const selectionProxy = new SelectionProxyHandler<TSelection>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
		});
		const aliasedSelection = new Proxy(qb.getSelection(), selectionProxy);
		return new Proxy(
			new PgMaterializedView({
				pgConfig: {
					with: this.config.with,
					using: this.config.using,
					tablespace: this.config.tablespace,
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selection: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as PgMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyPgColumnBuilder> = Record<string, AnyPgColumnBuilder>,
	TExcludedMethods extends string = never,
> extends MaterializedViewBuilderCore<
	ManualMaterializedViewBuilderHKT,
	{ name: TName; columns: TColumns; excludedMethods: TExcludedMethods }
> {
	private columns: BuildColumns<TName, TColumns>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTable(name, columns)) as BuildColumns<TName, TColumns>;
	}

	existing(): PgMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new PgMaterializedView({
				pgConfig: undefined,
				config: {
					name: this.name,
					schema: this.schema,
					selection: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
			}),
		) as PgMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns>>;
	}

	as(query: SQL): PgMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new PgMaterializedView({
				pgConfig: undefined,
				config: {
					name: this.name,
					schema: this.schema,
					selection: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
			}),
		) as PgMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns>>;
	}
}

export abstract class PgViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
> extends View<TName, TExisting> {
	declare protected $viewBrand: 'PgViewBase';
	protected abstract $pgViewBrand: string;

	declare protected $config: {
		name: TName;
		selection: SelectFields;
		query: SQL | undefined;
	};
}

export const PgViewConfig = Symbol('PgViewConfig');

export class PgView<
	TName extends string = string,
	TExisting extends boolean = boolean,
> extends PgViewBase<TName, TExisting> {
	declare protected $pgViewBrand: 'PgView';

	[PgViewConfig]: {
		with?: ViewWithConfig;
	} | undefined;

	constructor({ pgConfig, config }: {
		pgConfig: {
			with?: ViewWithConfig;
		} | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selection: SelectFields;
			query: SQL | undefined;
		};
	}) {
		super(config);
		if (pgConfig) {
			this[PgViewConfig] = {
				with: pgConfig.with,
			};
		}
	}
}

export type PgViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelection,
> = PgView<TName, TExisting> & TSelection;

export const PgMaterializedViewConfig = Symbol('PgMaterializedViewConfig');

export class PgMaterializedView<
	TName extends string = string,
	TExisting extends boolean = boolean,
> extends PgViewBase<TName, TExisting> {
	declare protected $pgViewBrand: 'PgMaterializedView';

	readonly [PgMaterializedViewConfig]: {
		readonly with?: PgMaterializedViewWithConfig;
		readonly using?: string;
		readonly tablespace?: string;
		readonly withNoData?: boolean;
	} | undefined;

	constructor({ pgConfig, config }: {
		pgConfig: {
			with: PgMaterializedViewWithConfig | undefined;
			using: string | undefined;
			tablespace: string | undefined;
			withNoData: boolean | undefined;
		} | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selection: SelectFields;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[PgMaterializedViewConfig] = {
			with: pgConfig?.with,
			using: pgConfig?.using,
			tablespace: pgConfig?.tablespace,
			withNoData: pgConfig?.withNoData,
		};
	}
}

export type PgMaterializedViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelection,
> = PgMaterializedView<TName, TExisting> & TSelection;

/** @internal */
export function pgViewWithSchema(
	name: string,
	selection: Record<string, AnyPgColumnBuilder> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

/** @internal */
export function pgMaterializedViewWithSchema(
	name: string,
	selection: Record<string, AnyPgColumnBuilder> | undefined,
	schema: string | undefined,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	if (selection) {
		return new ManualMaterializedViewBuilder(name, selection, schema);
	}
	return new MaterializedViewBuilder(name, schema);
}

export function pgView<TName extends string>(name: TName): ViewBuilder<TName>;
export function pgView<TName extends string, TColumns extends Record<string, AnyPgColumnBuilder>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function pgView(name: string, columns?: Record<string, AnyPgColumnBuilder>): ViewBuilder | ManualViewBuilder {
	return pgViewWithSchema(name, columns, undefined);
}

export function pgMaterializedView<TName extends string>(name: TName): MaterializedViewBuilder<TName>;
export function pgMaterializedView<TName extends string, TColumns extends Record<string, AnyPgColumnBuilder>>(
	name: TName,
	columns: TColumns,
): ManualMaterializedViewBuilder<TName, TColumns>;
export function pgMaterializedView(
	name: string,
	columns?: Record<string, AnyPgColumnBuilder>,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	return pgMaterializedViewWithSchema(name, columns, undefined);
}
