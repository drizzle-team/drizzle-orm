import type { BuildColumns, ColumnBuilderBase } from '~/column-builder.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { RequireAtLeastOne } from '~/utils.ts';
import type { GelColumn } from './columns/common.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { gelTable } from './table.ts';
import { GelViewBase } from './view-base.ts';
import { GelMaterializedViewConfig, GelViewConfig } from './view-common.ts';

export type ViewWithConfig = RequireAtLeastOne<{
	checkOption: 'local' | 'cascaded';
	securityBarrier: boolean;
	securityInvoker: boolean;
}>;

export class DefaultViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'GelDefaultViewBuilderCore';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: {
		with?: ViewWithConfig;
	} = {};

	with(config: ViewWithConfig): this {
		this.config.with = config;
		return this;
	}
}

export class ViewBuilder<TName extends string = string> extends DefaultViewBuilderCore<{ name: TName }> {
	static override readonly [entityKind]: string = 'GelViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): GelViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'gel'>> {
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
			new GelView({
				GelConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as GelViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'gel'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, ColumnBuilderBase> = Record<string, ColumnBuilderBase>,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'GelManualViewBuilder';

	private columns: Record<string, GelColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(gelTable(name, columns));
	}

	existing(): GelViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'gel'>> {
		return new Proxy(
			new GelView({
				GelConfig: undefined,
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
		) as GelViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'gel'>>;
	}

	as(query: SQL): GelViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'gel'>> {
		return new Proxy(
			new GelView({
				GelConfig: this.config,
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
		) as GelViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'gel'>>;
	}
}

export type GelMaterializedViewWithConfig = RequireAtLeastOne<{
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

export class MaterializedViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'GelMaterializedViewBuilderCore';

	declare _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: {
		with?: GelMaterializedViewWithConfig;
		using?: string;
		tablespace?: string;
		withNoData?: boolean;
	} = {};

	using(using: string): this {
		this.config.using = using;
		return this;
	}

	with(config: GelMaterializedViewWithConfig): this {
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

export class MaterializedViewBuilder<TName extends string = string>
	extends MaterializedViewBuilderCore<{ name: TName }>
{
	static override readonly [entityKind]: string = 'GelMaterializedViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): GelMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'gel'>> {
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
			new GelMaterializedView({
				GelConfig: {
					with: this.config.with,
					using: this.config.using,
					tablespace: this.config.tablespace,
					withNoData: this.config.withNoData,
				},
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as GelMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'gel'>>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, ColumnBuilderBase> = Record<string, ColumnBuilderBase>,
> extends MaterializedViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'GelManualMaterializedViewBuilder';

	private columns: Record<string, GelColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(gelTable(name, columns));
	}

	existing(): GelMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'gel'>> {
		return new Proxy(
			new GelMaterializedView({
				GelConfig: {
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
		) as GelMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'gel'>>;
	}

	as(query: SQL): GelMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'gel'>> {
		return new Proxy(
			new GelMaterializedView({
				GelConfig: {
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
		) as GelMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'gel'>>;
	}
}

export class GelView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends GelViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'GelView';

	[GelViewConfig]: {
		with?: ViewWithConfig;
	} | undefined;

	constructor({ GelConfig, config }: {
		GelConfig: {
			with?: ViewWithConfig;
		} | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
		if (GelConfig) {
			this[GelViewConfig] = {
				with: GelConfig.with,
			};
		}
	}
}

export type GelViewWithSelection<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = GelView<TName, TExisting, TSelectedFields> & TSelectedFields;

export class GelMaterializedView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends GelViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'GelMaterializedView';

	readonly [GelMaterializedViewConfig]: {
		readonly with?: GelMaterializedViewWithConfig;
		readonly using?: string;
		readonly tablespace?: string;
		readonly withNoData?: boolean;
	} | undefined;

	constructor({ GelConfig, config }: {
		GelConfig: {
			with: GelMaterializedViewWithConfig | undefined;
			using: string | undefined;
			tablespace: string | undefined;
			withNoData: boolean | undefined;
		} | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[GelMaterializedViewConfig] = {
			with: GelConfig?.with,
			using: GelConfig?.using,
			tablespace: GelConfig?.tablespace,
			withNoData: GelConfig?.withNoData,
		};
	}
}

export type GelMaterializedViewWithSelection<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = GelMaterializedView<TName, TExisting, TSelectedFields> & TSelectedFields;

/** @internal */
export function gelViewWithSchema(
	name: string,
	selection: Record<string, ColumnBuilderBase> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

/** @internal */
export function gelMaterializedViewWithSchema(
	name: string,
	selection: Record<string, ColumnBuilderBase> | undefined,
	schema: string | undefined,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	if (selection) {
		return new ManualMaterializedViewBuilder(name, selection, schema);
	}
	return new MaterializedViewBuilder(name, schema);
}

// TODO not implemented
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gelView<TName extends string>(name: TName): ViewBuilder<TName>;
function gelView<TName extends string, TColumns extends Record<string, ColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
function gelView(name: string, columns?: Record<string, ColumnBuilderBase>): ViewBuilder | ManualViewBuilder {
	return gelViewWithSchema(name, columns, undefined);
}

// TODO not implemented
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gelMaterializedView<TName extends string>(name: TName): MaterializedViewBuilder<TName>;
function gelMaterializedView<TName extends string, TColumns extends Record<string, ColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualMaterializedViewBuilder<TName, TColumns>;
function gelMaterializedView(
	name: string,
	columns?: Record<string, ColumnBuilderBase>,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	return gelMaterializedViewWithSchema(name, columns, undefined);
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isGelView(obj: unknown): obj is GelView {
	return is(obj, GelView);
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isGelMaterializedView(obj: unknown): obj is GelMaterializedView {
	return is(obj, GelMaterializedView);
}
