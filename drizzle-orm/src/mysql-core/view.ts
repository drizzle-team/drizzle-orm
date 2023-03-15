import type { SQL } from '~/sql';
import { SelectionProxyHandler } from '~/subquery';
import type { Assume } from '~/utils';
import { View } from '~/view';
import type { AnyMySqlColumnBuilder, BuildColumns } from './columns/common';
import type { QueryBuilder, QueryBuilderInstance } from './query-builders';
import { queryBuilder } from './query-builders';
import type { AddAliasToSelection, SelectFields } from './query-builders/select.types';
import { mysqlTable } from './table';
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
	$type: ManualViewBuilder<this['name'], Assume<this['columns'], Record<string, AnyMySqlColumnBuilder>>>;
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
	THKT extends ViewBuilderHKTBase,
	TConfig extends { name: string; columns?: unknown; excludedMethods: string },
> {
	declare protected $config: TConfig;

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: ViewBuilderConfig = {};

	algorithm(
		algorithm: Exclude<ViewBuilderConfig['algorithm'], undefined>,
	): ViewBuilderWithFilteredMethods<THKT, TConfig, 'algorithm'> {
		this.config.algorithm = algorithm;
		return this;
	}

	definer(
		definer: Exclude<ViewBuilderConfig['definer'], undefined>,
	): ViewBuilderWithFilteredMethods<THKT, TConfig, 'definer'> {
		this.config.definer = definer;
		return this;
	}

	sqlSecurity(
		sqlSecurity: Exclude<ViewBuilderConfig['sqlSecurity'], undefined>,
	): ViewBuilderWithFilteredMethods<THKT, TConfig, 'sqlSecurity'> {
		this.config.sqlSecurity = sqlSecurity;
		return this;
	}

	withCheckOption(
		withCheckOption?: Exclude<ViewBuilderConfig['withCheckOption'], undefined>,
	): ViewBuilderWithFilteredMethods<THKT, TConfig, 'withCheckOption'> {
		this.config.withCheckOption = withCheckOption ?? 'cascaded';
		return this;
	}
}

export class ViewBuilder<TName extends string = string, TExcludedMethods extends string = never>
	extends ViewBuilderCore<ViewBuilderHKT, { name: TName; excludedMethods: TExcludedMethods }>
{
	as<TSelection extends SelectFields>(
		qb: QueryBuilder<TSelection> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelection>),
	): MySqlViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>> {
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
			new MySqlView({
				mysqlConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selection: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as MySqlViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, AnyMySqlColumnBuilder> = Record<string, AnyMySqlColumnBuilder>,
	TExcludedMethods extends string = never,
> extends ViewBuilderCore<
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
		this.columns = getTableColumns(mysqlTable(name, columns)) as BuildColumns<TName, TColumns>;
	}

	existing(): MySqlViewWithSelection<TName, true, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new MySqlView({
				mysqlConfig: undefined,
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
		) as MySqlViewWithSelection<TName, true, BuildColumns<TName, TColumns>>;
	}

	as(query: SQL): MySqlViewWithSelection<TName, false, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new MySqlView({
				mysqlConfig: this.config,
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
		) as MySqlViewWithSelection<TName, false, BuildColumns<TName, TColumns>>;
	}
}

export abstract class MySqlViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
> extends View<TName, TExisting> {
	declare protected $viewBrand: 'MySqlViewBase';
	protected abstract $MySqlViewBrand: string;

	declare protected $config: {
		name: TName;
		selection: SelectFields;
		query: SQL | undefined;
	};
}

export const MySqlViewConfig = Symbol('MySqlViewConfig');

export class MySqlView<
	TName extends string = string,
	TExisting extends boolean = boolean,
> extends MySqlViewBase<TName, TExisting> {
	declare protected $MySqlViewBrand: 'MySqlView';

	[MySqlViewConfig]: ViewBuilderConfig | undefined;

	constructor({ mysqlConfig, config }: {
		mysqlConfig: ViewBuilderConfig | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selection: SelectFields;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[MySqlViewConfig] = mysqlConfig;
	}
}

export type MySqlViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelection,
> = MySqlView<TName, TExisting> & TSelection;

/** @internal */
export function mysqlViewWithSchema(
	name: string,
	selection: Record<string, AnyMySqlColumnBuilder> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

export function mysqlView<TName extends string>(name: TName): ViewBuilder<TName>;
export function mysqlView<TName extends string, TColumns extends Record<string, AnyMySqlColumnBuilder>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function mysqlView(
	name: string,
	selection?: Record<string, AnyMySqlColumnBuilder>,
): ViewBuilder | ManualViewBuilder {
	return mysqlViewWithSchema(name, selection, undefined);
}
