import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { FirebirdColumn, FirebirdColumnBuilderBase } from './columns/common.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { firebirdTable } from './table.ts';
import { FirebirdViewBase } from './view-base.ts';

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	definer?: string;
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<
	TConfig extends { name: string; columns?: unknown },
> {
	static readonly [entityKind]: string = 'FirebirdViewBuilderCore';

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
	static override readonly [entityKind]: string = 'FirebirdViewBuilder';

	as<TSelection extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
	): FirebirdViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName, 'firebird'>> {
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
			new FirebirdView({
				// firebirdConfig: this.config,
				config: {
					name: this.name,
					schema: undefined,
					selectedFields: aliasedSelectedFields,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as FirebirdViewWithSelection<TName, false, AddAliasToSelection<TSelection, TName, 'firebird'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, FirebirdColumnBuilderBase> = Record<string, FirebirdColumnBuilderBase>,
> extends ViewBuilderCore<
	{ name: TName; columns: TColumns }
> {
	static override readonly [entityKind]: string = 'FirebirdManualViewBuilder';

	private columns: Record<string, FirebirdColumn>;

	constructor(
		name: TName,
		columns: TColumns,
	) {
		super(name);
		this.columns = getTableColumns(firebirdTable(name, columns)) as BuildColumns<TName, TColumns, 'firebird'>;
	}

	existing(): FirebirdViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'firebird'>> {
		return new Proxy(
			new FirebirdView({
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
		) as FirebirdViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'firebird'>>;
	}

	as(query: SQL): FirebirdViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'firebird'>> {
		return new Proxy(
			new FirebirdView({
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
		) as FirebirdViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'firebird'>>;
	}
}

export class FirebirdView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> extends FirebirdViewBase<TName, TExisting, TSelection> {
	static override readonly [entityKind]: string = 'FirebirdView';

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

export type FirebirdViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelection extends ColumnsSelection,
> = FirebirdView<TName, TExisting, TSelection> & TSelection;

export function firebirdView<TName extends string>(name: TName): ViewBuilder<TName>;
export function firebirdView<TName extends string, TColumns extends Record<string, FirebirdColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function firebirdView(
	name: string,
	selection?: Record<string, FirebirdColumnBuilderBase>,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection);
	}
	return new ViewBuilder(name);
}

export const view = firebirdView;
