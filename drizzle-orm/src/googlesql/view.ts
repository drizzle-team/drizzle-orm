import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { GoogleSqlColumn, GoogleSqlColumnBuilderBase } from './columns/index.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import { googlesqlTable } from './table.ts';
import { GoogleSqlViewBase } from './view-base.ts';
import { GoogleSqlViewConfig } from './view-common.ts';

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'GoogleSqlViewBuilder';

	declare readonly _: {
		readonly name: TConfig['name'];
		readonly columns: TConfig['columns'];
	};

	constructor(
		protected name: TConfig['name'],
		protected schema: string | undefined,
	) {}

	protected config: ViewBuilderConfig = {};

	algorithm(
		algorithm: Exclude<ViewBuilderConfig['algorithm'], undefined>,
	): this {
		this.config.algorithm = algorithm;
		return this;
	}

	sqlSecurity(
		sqlSecurity: Exclude<ViewBuilderConfig['sqlSecurity'], undefined>,
	): this {
		this.config.sqlSecurity = sqlSecurity;
		return this;
	}

	withCheckOption(
		withCheckOption?: Exclude<ViewBuilderConfig['withCheckOption'], undefined>,
	): this {
		this.config.withCheckOption = withCheckOption ?? 'cascaded';
		return this;
	}
}

export class ViewBuilder<TName extends string = string> extends ViewBuilderCore<{ name: TName }> {
	static override readonly [entityKind]: string = 'GoogleSqlViewBuilder';

	as<TSelectedFields extends ColumnsSelection>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): GoogleSqlViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'googlesql'>> {
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
			new GoogleSqlView({
				googlesqlConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as GoogleSqlViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'googlesql'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, GoogleSqlColumnBuilderBase> = Record<string, GoogleSqlColumnBuilderBase>,
> extends ViewBuilderCore<{ name: TName; columns: TColumns }> {
	static override readonly [entityKind]: string = 'GoogleSqlManualViewBuilder';

	private columns: Record<string, GoogleSqlColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(googlesqlTable(name, columns)) as BuildColumns<TName, TColumns, 'googlesql'>;
	}

	existing(): GoogleSqlViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'googlesql'>> {
		return new Proxy(
			new GoogleSqlView({
				googlesqlConfig: undefined,
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
		) as GoogleSqlViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'googlesql'>>;
	}

	as(query: SQL): GoogleSqlViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'googlesql'>> {
		return new Proxy(
			new GoogleSqlView({
				googlesqlConfig: this.config,
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
		) as GoogleSqlViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'googlesql'>>;
	}
}

export class GoogleSqlView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends GoogleSqlViewBase<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'GoogleSqlView';

	declare protected $GoogleSqlViewBrand: 'GoogleSqlView';

	[GoogleSqlViewConfig]: ViewBuilderConfig | undefined;

	constructor({ googlesqlConfig, config }: {
		googlesqlConfig: ViewBuilderConfig | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[GoogleSqlViewConfig] = googlesqlConfig;
	}
}

export type GoogleSqlViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelectedFields extends ColumnsSelection,
> = GoogleSqlView<TName, TExisting, TSelectedFields> & TSelectedFields;

/** @internal */
export function googlesqlViewWithSchema(
	name: string,
	selection: Record<string, GoogleSqlColumnBuilderBase> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

export function googlesqlView<TName extends string>(name: TName): ViewBuilder<TName>;
export function googlesqlView<TName extends string, TColumns extends Record<string, GoogleSqlColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function googlesqlView(
	name: string,
	selection?: Record<string, GoogleSqlColumnBuilderBase>,
): ViewBuilder | ManualViewBuilder {
	return googlesqlViewWithSchema(name, selection, undefined);
}
