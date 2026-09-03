import type { Casing } from '~/casing.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { RequireAtLeastOne } from '~/utils.ts';
import type { UpdateViewConfig, ViewConfig } from '~/view.ts';
import type { AnyPgColumnBuilder, PgBuildColumns, PgColumn } from './columns/common.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { pgTableWithSchema } from './table.ts';
import { PgViewBase } from './view-base.ts';
import { PgMaterializedViewConfig, PgViewConfig } from './view-common.ts';
import { collectPgViewDependencies, setPgViewDependencies } from './view-dependencies.ts';

export type ViewWithConfig = RequireAtLeastOne<{
	checkOption: 'local' | 'cascaded';
	securityBarrier: boolean;
	securityInvoker: boolean;
}>;

export class DefaultViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
	TSchema extends string | undefined = undefined,
> {
	static readonly [entityKind]: string = 'PgDefaultViewBuilderCore';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: TSchema,
	) {}

	protected config: {
		with?: ViewWithConfig;
	} = {};

	with(config: ViewWithConfig): this {
		this.config.with = config;
		return this;
	}
}

export class ViewBuilder<
	TName extends string = string,
	TSchema extends string | undefined = undefined,
> extends DefaultViewBuilderCore<{ name: TName }, TSchema> {
	static override readonly [entityKind]: string = 'PgViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): PgViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: AddAliasToSelection<TSelectedFields, TName, 'pg'>;
		}
	> {
		if (typeof qb === 'function') {
			qb = qb(new QueryBuilder());
		}
		const selectedFields = qb.getSelectedFields();
		const query = qb.withoutSelectionCastCodecs().getSQL().inlineParams();
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
			replaceOriginalName: true,
		});
		const aliasedSelection = new Proxy(selectedFields, selectionProxy);
		return new Proxy(
			setPgViewDependencies(
				new PgView({
					pgConfig: this.config,
					config: {
						name: this.name,
						schema: this.schema,
						selectedFields: aliasedSelection,
						query,
					},
				}),
				collectPgViewDependencies(qb),
			),
			selectionProxy as any,
		) as PgViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: AddAliasToSelection<TSelectedFields, TName, 'pg'>;
			}
		>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyPgColumnBuilder> = Record<string, AnyPgColumnBuilder>,
	TSchema extends string | undefined = undefined,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }, TSchema> {
	static override readonly [entityKind]: string = 'PgManualViewBuilder';

	private columns: Record<string, PgColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: TSchema,
		casing: Casing | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTableWithSchema(name, columns, undefined, schema, casing));
	}

	existing(): PgViewWithSelection<
		{ name: TName; schema: TSchema; existing: true; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
	> {
		return new Proxy(
			new PgView({
				pgConfig: undefined,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as PgViewWithSelection<
			{ name: TName; schema: TSchema; existing: true; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
		>;
	}

	as(
		query: SQL,
	): PgViewWithSelection<
		{ name: TName; schema: TSchema; existing: false; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
	> {
		return new Proxy(
			new PgView({
				pgConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as PgViewWithSelection<
			{ name: TName; schema: TSchema; existing: false; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
		>;
	}
}

export type PgMaterializedViewWithConfig = RequireAtLeastOne<{
	fillfactor: number;
	toastTupleTarget: number;
	parallelWorkers: number;
	autovacuumEnabled: boolean;
	vacuumIndexCleanup: 'auto' | 'off' | 'on';
	vacuumTruncate: boolean;
	autovacuumVacuumThreshold: number;
	autovacuumVacuumScaleFactor: number;
	autovacuumVacuumCostDelay: number;
	autovacuumVacuumCostLimit: number;
	autovacuumFreezeMinAge: number;
	autovacuumFreezeMaxAge: number;
	autovacuumFreezeTableAge: number;
	autovacuumMultixactFreezeMinAge: number;
	autovacuumMultixactFreezeMaxAge: number;
	autovacuumMultixactFreezeTableAge: number;
	logAutovacuumMinDuration: number;
	userCatalogTable: boolean;
}>;

export class MaterializedViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
	TSchema extends string | undefined = undefined,
> {
	static readonly [entityKind]: string = 'PgMaterializedViewBuilderCore';

	declare _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: TSchema,
	) {}

	protected config: {
		with?: PgMaterializedViewWithConfig;
		using?: string;
		tablespace?: string;
		withNoData?: boolean;
	} = {};

	using(using: string): this {
		this.config.using = using;
		return this;
	}

	with(config: PgMaterializedViewWithConfig): this {
		this.config.with = config;
		return this;
	}

	tablespace(tablespace: string): this {
		this.config.tablespace = tablespace;
		return this;
	}

	withNoData(): this {
		this.config.withNoData = true;
		return this;
	}
}

export class MaterializedViewBuilder<
	TName extends string = string,
	TSchema extends string | undefined = undefined,
> extends MaterializedViewBuilderCore<{ name: TName }, TSchema> {
	static override readonly [entityKind]: string = 'PgMaterializedViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): PgMaterializedViewWithSelection<
		{
			name: TName;
			schema: TSchema;
			existing: false;
			isAlias: false;
			selectedFields: AddAliasToSelection<TSelectedFields, TName, 'pg'>;
		}
	> {
		if (typeof qb === 'function') {
			qb = qb(new QueryBuilder());
		}
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
			replaceOriginalName: true,
		});
		const aliasedSelection = new Proxy(qb.getSelectedFields(), selectionProxy);
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
					selectedFields: aliasedSelection,
					query: qb.withoutSelectionCastCodecs().getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as PgMaterializedViewWithSelection<
			{
				name: TName;
				schema: TSchema;
				existing: false;
				isAlias: false;
				selectedFields: AddAliasToSelection<TSelectedFields, TName, 'pg'>;
			}
		>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyPgColumnBuilder> = Record<string, AnyPgColumnBuilder>,
	TSchema extends string | undefined = undefined,
> extends MaterializedViewBuilderCore<{ name: TName; columns: TColumns }, TSchema> {
	static override readonly [entityKind]: string = 'PgManualMaterializedViewBuilder';

	private columns: Record<string, PgColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: TSchema,
		casing: Casing | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTableWithSchema(name, columns, undefined, schema, casing));
	}

	existing(): PgMaterializedViewWithSelection<
		{ name: TName; schema: TSchema; existing: true; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
	> {
		return new Proxy(
			new PgMaterializedView({
				pgConfig: {
					tablespace: this.config.tablespace,
					using: this.config.using,
					with: this.config.with,
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: undefined,
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as PgMaterializedViewWithSelection<
			{ name: TName; schema: TSchema; existing: true; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
		>;
	}

	as(
		query: SQL,
	): PgMaterializedViewWithSelection<
		{ name: TName; schema: TSchema; existing: false; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
	> {
		return new Proxy(
			new PgMaterializedView({
				pgConfig: {
					tablespace: this.config.tablespace,
					using: this.config.using,
					with: this.config.with,
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: this.columns,
					query: query.inlineParams(),
				},
			}),
			new SelectionProxyHandler({
				alias: this.name,
				sqlBehavior: 'error',
				sqlAliasedBehavior: 'alias',
				replaceOriginalName: true,
			}),
		) as PgMaterializedViewWithSelection<
			{ name: TName; schema: TSchema; existing: false; isAlias: false; selectedFields: PgBuildColumns<TName, TColumns> }
		>;
	}
}

export class PgView<T extends ViewConfig = ViewConfig> extends PgViewBase<T> {
	static override readonly [entityKind]: string = 'PgView';

	[PgViewConfig]: {
		with?: ViewWithConfig;
	} | undefined;

	constructor({ pgConfig, config }: {
		pgConfig: {
			with?: ViewWithConfig;
		} | undefined;
		config: {
			name: T['name'];
			schema: T['schema'];
			selectedFields: ColumnsSelection;
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

export type PgViewWithSelection<T extends ViewConfig> = PgView<T> & T['selectedFields'];

/**
 * Any PostgreSQL view with a specified boundary, e.g. `AnyPgView<{ name: 'my_view' }>`.
 *
 * To describe any view with any config, use `PgView` without type arguments.
 */
export type AnyPgView<TPartial extends Partial<ViewConfig> = {}> = PgView<UpdateViewConfig<ViewConfig, TPartial>>;

export class PgMaterializedView<T extends ViewConfig = ViewConfig> extends PgViewBase<T> {
	static override readonly [entityKind]: string = 'PgMaterializedView';

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
			name: T['name'];
			schema: T['schema'];
			selectedFields: ColumnsSelection;
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

export type PgMaterializedViewWithSelection<T extends ViewConfig> = PgMaterializedView<T> & T['selectedFields'];

/**
 * Any PostgreSQL materialized view with a specified boundary, e.g. `AnyPgMaterializedView<{ name: 'my_view' }>`.
 *
 * To describe any view with any config, use `PgMaterializedView` without type arguments.
 */
export type AnyPgMaterializedView<TPartial extends Partial<ViewConfig> = {}> = PgMaterializedView<
	UpdateViewConfig<ViewConfig, TPartial>
>;

/** @internal */
export function pgViewWithSchema<TSchema extends string | undefined>(
	name: string,
	selection: Record<string, AnyPgColumnBuilder> | undefined,
	schema: TSchema,
	casing: Casing | undefined,
): ViewBuilder<string, TSchema> | ManualViewBuilder<string, Record<string, AnyPgColumnBuilder>, TSchema> {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema, casing);
	}
	return new ViewBuilder(name, schema);
}

/** @internal */
export function pgMaterializedViewWithSchema<TSchema extends string | undefined>(
	name: string,
	selection: Record<string, AnyPgColumnBuilder> | undefined,
	schema: TSchema,
	casing: Casing | undefined,
):
	| MaterializedViewBuilder<string, TSchema>
	| ManualMaterializedViewBuilder<string, Record<string, AnyPgColumnBuilder>, TSchema>
{
	if (selection) {
		return new ManualMaterializedViewBuilder(name, selection, schema, casing);
	}
	return new MaterializedViewBuilder(name, schema);
}

export interface PgViewFn<TSchema extends string | undefined = undefined> {
	<TName extends string>(name: TName): ViewBuilder<TName, TSchema>;
	<TName extends string, TColumns extends Record<string, AnyPgColumnBuilder>>(
		name: TName,
		columns: TColumns,
	): ManualViewBuilder<TName, TColumns, TSchema>;
}

export interface PgMaterializedViewFn<TSchema extends string | undefined = undefined> {
	<TName extends string>(name: TName): MaterializedViewBuilder<TName, TSchema>;
	<TName extends string, TColumns extends Record<string, AnyPgColumnBuilder>>(
		name: TName,
		columns: TColumns,
	): ManualMaterializedViewBuilder<TName, TColumns, TSchema>;
}

/** @internal */
export function pgViewWithCasing(casing: Casing | undefined): PgViewFn {
	return ((name, columns) => pgViewWithSchema(name, columns, undefined, casing)) as PgViewFn;
}

/** @internal */
export function pgMaterializedViewWithCasing(casing: Casing | undefined): PgMaterializedViewFn {
	return ((name, columns) => pgMaterializedViewWithSchema(name, columns, undefined, casing)) as PgMaterializedViewFn;
}

export const pgView = pgViewWithCasing(undefined);

export const pgMaterializedView = pgMaterializedViewWithCasing(undefined);

export function isPgView(obj: unknown): obj is PgView {
	return is(obj, PgView);
}

export function isPgMaterializedView(obj: unknown): obj is PgMaterializedView {
	return is(obj, PgMaterializedView);
}
