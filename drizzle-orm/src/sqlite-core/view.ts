import type { SQL } from '~/sql';
import { SelectionProxyHandler } from '~/subquery';
import type { Assume } from '~/utils';
import { View } from '~/view';
import type { AnySQLiteColumnBuilder, BuildColumns } from './columns/common';
import type { QueryBuilder, QueryBuilderInstance } from './query-builders';
import { queryBuilder } from './query-builders';
import type { AddAliasToSelection, SelectFields } from './query-builders/select.types';
import { sqliteTable } from './table';
import { getTableColumns } from './utils';

export interface ViewBuilderHKTBase {
	name: string;
	columns: unknown;
	excludedMethods: string;
	$type: unknown;
}

export type ViewBuilderKind<
	T extends ViewBuilderHKTBase,
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
> = (T & {
	name: TConfig['name'];
	columns: TConfig['columns'];
	excludedMethods: TConfig['excludedMethods'];
})['$type'];

export type ViewBuilderWithFilteredMethods<
	THKT extends ViewBuilderHKTBase,
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
	TNewExcludedMethods extends string,
> = Omit<
	ViewBuilderKind<THKT, TConfig & { excludedMethods: TConfig['excludedMethods'] | TNewExcludedMethods }>,
	TConfig['excludedMethods'] | TNewExcludedMethods
>;

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	definer?: string;
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
> {
	declare protected $config: TConfig;

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: ViewBuilderConfig = {};
}

export class ViewBuilder<TName extends string = string, TExcludedMethods extends string = never>
	extends ViewBuilderCore<{ name: TName; excludedMethods: TExcludedMethods }>
{
	as<TSelection extends SelectFields>(
		qb: QueryBuilder<TSelection> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelection>),
	): SQLiteViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>> {
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
			new SQLiteView({
				sqliteConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selection: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as SQLiteViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnySQLiteColumnBuilder> = Record<string, AnySQLiteColumnBuilder>,
	TExcludedMethods extends string = never,
> extends ViewBuilderCore<
	{ name: TName; columns: TColumns; excludedMethods: TExcludedMethods }
> {
	private columns: BuildColumns<TName, TColumns>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(sqliteTable(name, columns)) as BuildColumns<TName, TColumns>;
	}

	existing(): SQLiteViewWithSelection<TName, true, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new SQLiteView({
				sqliteConfig: undefined,
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
		) as SQLiteViewWithSelection<TName, true, BuildColumns<TName, TColumns>>;
	}

	as(query: SQL): SQLiteViewWithSelection<TName, false, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new SQLiteView({
				sqliteConfig: this.config,
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
		) as SQLiteViewWithSelection<TName, false, BuildColumns<TName, TColumns>>;
	}
}

export abstract class SQLiteViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
> extends View<TName, TExisting> {
	declare protected $viewBrand: 'SQLiteViewBase';
	protected abstract $SQLiteViewBrand: string;

	declare protected $config: {
		name: TName;
		selection: SelectFields;
		query: SQL | undefined;
	};
}

export const SQLiteViewConfig = Symbol('SQLiteViewConfig');

export class SQLiteView<
	TName extends string = string,
	TExisting extends boolean = boolean,
> extends SQLiteViewBase<TName, TExisting> {
	declare protected $SQLiteViewBrand: 'SQLiteView';

	[SQLiteViewConfig]: ViewBuilderConfig | undefined;

	constructor({ sqliteConfig, config }: {
		sqliteConfig: ViewBuilderConfig | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selection: SelectFields;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[SQLiteViewConfig] = sqliteConfig;
	}
}

export type SQLiteViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelection,
> = SQLiteView<TName, TExisting> & TSelection;

/** @internal */
export function sqliteViewWithSchema(
	name: string,
	selection: Record<string, AnySQLiteColumnBuilder> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

export function sqliteView<TName extends string>(name: TName): ViewBuilder<TName>;
export function sqliteView<TName extends string, TColumns extends Record<string, AnySQLiteColumnBuilder>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function sqliteView(
	name: string,
	selection?: Record<string, AnySQLiteColumnBuilder>,
): ViewBuilder | ManualViewBuilder {
	return sqliteViewWithSchema(name, selection, undefined);
}
