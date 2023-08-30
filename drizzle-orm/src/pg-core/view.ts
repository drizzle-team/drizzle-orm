import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import type { SQL } from '~/sql/index.ts';
import { SelectionProxyHandler } from '~/subquery.ts';
import { getTableColumns } from '~/utils.ts';
import { type ColumnsSelection, View } from '~/view.ts';
import type { PgColumn, PgColumnBuilderBase } from './columns/common.ts';
import { QueryBuilder } from './query-builders/index.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import { pgTable } from './table.ts';

export interface ViewWithConfig {
	checkOption: 'local' | 'cascaded';
	securityBarrier: boolean;
	securityInvoker: boolean;
}

export class DefaultViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'PgDefaultViewBuilderCore';

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
	static readonly [entityKind]: string = 'PgViewBuilder';

	as<TSelectedFields extends SelectedFields>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): PgViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'pg'>> {
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
			new PgView({
				pgConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as PgViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'pg'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, PgColumnBuilderBase> = Record<string, PgColumnBuilderBase>,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }> {
	static readonly [entityKind]: string = 'PgManualViewBuilder';

	private columns: Record<string, PgColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTable(name, columns));
	}

	existing(): PgViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'pg'>> {
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
		) as PgViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'pg'>>;
	}

	as(query: SQL): PgViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'pg'>> {
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
		) as PgViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'pg'>>;
	}
}

export interface PgMaterializedViewWithConfig {
	[Key: string]: string | number | boolean | SQL;
}

export class MaterializedViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'PgMaterializedViewBuilderCore';

	declare _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

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

export class MaterializedViewBuilder<TName extends string = string>
	extends MaterializedViewBuilderCore<{ name: TName }>
{
	static readonly [entityKind]: string = 'PgMaterializedViewBuilder';

	as<TSelectedFields extends SelectedFields>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): PgMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'pg'>> {
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
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as PgMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'pg'>>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, PgColumnBuilderBase> = Record<string, PgColumnBuilderBase>,
> extends MaterializedViewBuilderCore<{ name: TName; columns: TColumns }> {
	static readonly [entityKind]: string = 'PgManualMaterializedViewBuilder';

	private columns: Record<string, PgColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTable(name, columns));
	}

	existing(): PgMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'pg'>> {
		return new Proxy(
			new PgMaterializedView({
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
		) as PgMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'pg'>>;
	}

	as(query: SQL): PgMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'pg'>> {
		return new Proxy(
			new PgMaterializedView({
				pgConfig: undefined,
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
		) as PgMaterializedViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'pg'>>;
	}
}

export abstract class PgViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends View<TName, TExisting, TSelectedFields> {
	static readonly [entityKind]: string = 'PgViewBase';

	declare readonly _: View<TName, TExisting, TSelectedFields>['_'] & {
		readonly viewBrand: 'PgViewBase';
	};
}

export const PgViewConfig = Symbol.for('drizzle:PgViewConfig');

export class PgView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends PgViewBase<TName, TExisting, TSelectedFields> {
	static readonly [entityKind]: string = 'PgView';

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
			selectedFields: SelectedFields;
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
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = PgView<TName, TExisting, TSelectedFields> & TSelectedFields;

export const PgMaterializedViewConfig = Symbol.for('drizzle:PgMaterializedViewConfig');

export class PgMaterializedView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends PgViewBase<TName, TExisting, TSelectedFields> {
	static readonly [entityKind]: string = 'PgMaterializedView';

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
			selectedFields: SelectedFields;
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
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> = PgMaterializedView<TName, TExisting, TSelectedFields> & TSelectedFields;

/** @internal */
export function pgViewWithSchema(
	name: string,
	selection: Record<string, PgColumnBuilderBase> | undefined,
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
	selection: Record<string, PgColumnBuilderBase> | undefined,
	schema: string | undefined,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	if (selection) {
		return new ManualMaterializedViewBuilder(name, selection, schema);
	}
	return new MaterializedViewBuilder(name, schema);
}

export function pgView<TName extends string>(name: TName): ViewBuilder<TName>;
export function pgView<TName extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function pgView(name: string, columns?: Record<string, PgColumnBuilderBase>): ViewBuilder | ManualViewBuilder {
	return pgViewWithSchema(name, columns, undefined);
}

export function pgMaterializedView<TName extends string>(name: TName): MaterializedViewBuilder<TName>;
export function pgMaterializedView<TName extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualMaterializedViewBuilder<TName, TColumns>;
export function pgMaterializedView(
	name: string,
	columns?: Record<string, PgColumnBuilderBase>,
): MaterializedViewBuilder | ManualMaterializedViewBuilder {
	return pgMaterializedViewWithSchema(name, columns, undefined);
}
