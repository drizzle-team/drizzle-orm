import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { SQLiteColumn, SQLiteColumnBuilderBase } from './columns/common.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { sqliteTable } from './table.ts';
import { SQLiteViewBase } from './view-base.ts';

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	definer?: string;
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
> {
	static readonly [entityKind]: string = 'SQLiteViewBuilderCore';

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
	static override readonly [entityKind]: string = 'SQLiteViewBuilder';

	as<TSelection extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
	): SQLiteViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName, 'sqlite'>> {
		if (typeof qb === 'function') {
			qb = qb(new QueryBuilder());
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
				// sqliteConfig: this.config,
				config: {
					name: this.name,
					schema: undefined,
					selectedFields: aliasedSelectedFields,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as SQLiteViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName, 'sqlite'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, SQLiteColumnBuilderBase> = Record<string, SQLiteColumnBuilderBase>,
> extends ViewBuilderCore<
	{ name: TName; columns: TColumns }
> {
	static override readonly [entityKind]: string = 'SQLiteManualViewBuilder';

	private columns: Record<string, SQLiteColumn>;

	constructor(
		name: TName,
		columns: TColumns,
	) {
		super(name);
		this.columns = getTableColumns(sqliteTable(name, columns)) as BuildColumns<TName, TColumns, 'sqlite'>;
	}

	existing(): SQLiteViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'sqlite'>> {
		return new Proxy(
			new SQLiteView({
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
		) as SQLiteViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'sqlite'>>;
	}

	as(query: SQL): SQLiteViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'sqlite'>> {
		return new Proxy(
			new SQLiteView({
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
		) as SQLiteViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'sqlite'>>;
	}
}

export class SQLiteView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> extends SQLiteViewBase<TName, TExisting, TSelection> {
	static override readonly [entityKind]: string = 'SQLiteView';

	constructor({ config }: {
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
	}
}

export type SQLiteViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelection extends ColumnsSelection,
> = SQLiteView<TName, TExisting, TSelection> & TSelection;

export function sqliteView<TName extends string>(name: TName): ViewBuilder<TName>;
export function sqliteView<TName extends string, TColumns extends Record<string, SQLiteColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function sqliteView(
	name: string,
	selection?: Record<string, SQLiteColumnBuilderBase>,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection);
	}
	return new ViewBuilder(name);
}

export const view = sqliteView;
