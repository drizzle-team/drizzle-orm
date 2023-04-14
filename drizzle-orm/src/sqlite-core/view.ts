import type { BuildColumns } from '~/column-builder';
import type { QueryBuilder } from '~/query-builders/query-builder';
import type { AddAliasToSelection } from '~/query-builders/select.types';
import type { SQL } from '~/sql';
import { SelectionProxyHandler } from '~/subquery';
import { getTableColumns } from '~/utils';
import { type ColumnsSelection, View } from '~/view';
import type { AnySQLiteColumnBuilder } from './columns/common';
import type { QueryBuilderInstance } from './query-builders';
import { queryBuilder } from './query-builders';
import type { SelectedFields } from './query-builders/select.types';
import { sqliteTable } from './table';

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	definer?: string;
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
> {
	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
	) {}

	protected config: ViewBuilderConfig = {};
}

export class ViewBuilder<TName extends string = string> extends ViewBuilderCore<{ name: TName }> {
	as<TSelection extends SelectedFields>(
		qb: QueryBuilder<TSelection> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelection>),
	): SQLiteViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName>> {
		if (typeof qb === 'function') {
			qb = qb(queryBuilder);
		}
		const selectionProxy = new SelectionProxyHandler<TSelection>({
			alias: this.name,
			sqlBehavior: 'error',
			sqlAliasedBehavior: 'alias',
			replaceOriginalName: true,
		});
		// const aliasedSelectedFields = new Proxy(qb.getSelectedFields(), selectionProxy);
		const aliasedSelectedFields = qb.getSelectedFields();
		return new Proxy(
			new SQLiteView({
				sqliteConfig: this.config,
				config: {
					name: this.name,
					schema: undefined,
					selectedFields: aliasedSelectedFields,
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
> extends ViewBuilderCore<
	{ name: TName; columns: TColumns }
> {
	private columns: BuildColumns<TName, TColumns>;

	constructor(
		name: TName,
		columns: TColumns,
	) {
		super(name);
		this.columns = getTableColumns(sqliteTable(name, columns)) as BuildColumns<TName, TColumns>;
	}

	existing(): SQLiteViewWithSelection<TName, true, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new SQLiteView({
				sqliteConfig: undefined,
				config: {
					name: this.name,
					schema: undefined,
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
		) as SQLiteViewWithSelection<TName, true, BuildColumns<TName, TColumns>>;
	}

	as(query: SQL): SQLiteViewWithSelection<TName, false, BuildColumns<TName, TColumns>> {
		return new Proxy(
			new SQLiteView({
				sqliteConfig: this.config,
				config: {
					name: this.name,
					schema: undefined,
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
		) as SQLiteViewWithSelection<TName, false, BuildColumns<TName, TColumns>>;
	}
}

export abstract class SQLiteViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> extends View<TName, TExisting, TSelection> {
	declare _: View<TName, TExisting, TSelection>['_'] & {
		viewBrand: 'SQLiteView';
	};
}

export const SQLiteViewConfig = Symbol('SQLiteViewConfig');

export class SQLiteView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> extends SQLiteViewBase<TName, TExisting, TSelection> {
	/** @internal */
	[SQLiteViewConfig]: ViewBuilderConfig | undefined;

	constructor({ sqliteConfig, config }: {
		sqliteConfig: ViewBuilderConfig | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: SelectedFields;
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
	TSelection extends ColumnsSelection,
> = SQLiteView<TName, TExisting, TSelection> & TSelection;

export function sqliteView<TName extends string>(name: TName): ViewBuilder<TName>;
export function sqliteView<TName extends string, TColumns extends Record<string, AnySQLiteColumnBuilder>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function sqliteView(
	name: string,
	selection?: Record<string, AnySQLiteColumnBuilder>,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection);
	}
	return new ViewBuilder(name);
}

export const view = sqliteView;
