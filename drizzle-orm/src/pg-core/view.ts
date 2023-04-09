import type { BuildColumns } from '~/column-builder';
import type { QueryBuilder } from '~/query-builders/query-builder';
import type { AddAliasToSelection } from '~/query-builders/select.types';
import type { SQL } from '~/sql';
import { SelectionProxyHandler } from '~/subquery';
import { getTableColumns } from '~/utils';
import { View } from '~/view';
import type { AnyPgColumnBuilder } from './columns/common';
import type { QueryBuilderInstance } from './query-builders';
import { queryBuilder } from './query-builders';
import type { SelectedFields } from './query-builders/select.types';
import { pgTable } from './table';

export interface ViewWithConfig {
	checkOption: 'local' | 'cascaded';
	securityBarrier: boolean;
	securityInvoker: boolean;
}

export class DefaultViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
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
	as<TSelectedFields extends SelectedFields>(
		qb: QueryBuilder<TSelectedFields> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelectedFields>),
	): PgViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName>> {
		if (typeof qb === 'function') {
			qb = qb(queryBuilder);
		}
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
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
		) as PgViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyPgColumnBuilder> = Record<string, AnyPgColumnBuilder>,
> extends DefaultViewBuilderCore<{ name: TName; columns: TColumns }> {
	private columns: BuildColumns<TName, TColumns>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTable(name, columns));
	}

	existing(): PgViewWithSelection<TName, true, BuildColumns<TName, TColumns>> {
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
					selectedFields: this.columns,
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

export class MaterializedViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
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
	as<TSelectedFields extends SelectedFields>(
		qb: QueryBuilder<TSelectedFields> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelectedFields>),
	): PgMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName>> {
		if (typeof qb === 'function') {
			qb = qb(queryBuilder);
		}
		const selectionProxy = new SelectionProxyHandler<TSelectedFields>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
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
		) as PgMaterializedViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName>>;
	}
}

export class ManualMaterializedViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyPgColumnBuilder> = Record<string, AnyPgColumnBuilder>,
> extends MaterializedViewBuilderCore<{ name: TName; columns: TColumns }> {
	private columns: BuildColumns<TName, TColumns>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(pgTable(name, columns));
	}

	existing(): PgMaterializedViewWithSelection<TName, true, BuildColumns<TName, TColumns>> {
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
					selectedFields: this.columns,
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
	TSelectedFields = unknown,
> extends View<TName, TExisting, TSelectedFields> {
	declare readonly _: View<TName, TExisting, TSelectedFields>['_'] & {
		readonly viewBrand: 'PgViewBase';
	};
}

export const PgViewConfig = Symbol('PgViewConfig');

export class PgView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields = unknown,
> extends PgViewBase<TName, TExisting, TSelectedFields> {
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
	TSelectedFields = unknown,
> = PgView<TName, TExisting, TSelectedFields> & TSelectedFields;

export const PgMaterializedViewConfig = Symbol('PgMaterializedViewConfig');

export class PgMaterializedView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields = unknown,
> extends PgViewBase<TName, TExisting, TSelectedFields> {
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
	TSelectedFields = unknown,
> = PgMaterializedView<TName, TExisting, TSelectedFields> & TSelectedFields;

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
