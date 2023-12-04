import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AddAliasToSelection } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { getTableColumns } from '~/utils.ts';
import type { MsSqlColumn, MsSqlColumnBuilderBase } from './columns/index.ts';
import { QueryBuilder } from './query-builders/query-builder.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import { mssqlTable } from './table.ts';
import { MsSqlViewBase } from './view-base.ts';
import { MsSqlViewConfig } from './view-common.ts';

export interface ViewBuilderConfig {
	algorithm?: 'undefined' | 'merge' | 'temptable';
	definer?: string;
	sqlSecurity?: 'definer' | 'invoker';
	withCheckOption?: 'cascaded' | 'local';
}

export class ViewBuilderCore<TConfig extends { name: string; columns?: unknown }> {
	static readonly [entityKind]: string = 'MsSqlViewBuilder';

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

	definer(
		definer: Exclude<ViewBuilderConfig['definer'], undefined>,
	): this {
		this.config.definer = definer;
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
	static readonly [entityKind]: string = 'MsSqlViewBuilder';

	as<TSelectedFields extends SelectedFields>(
		qb: TypedQueryBuilder<TSelectedFields> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelectedFields>),
	): MsSqlViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'mssql'>> {
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
			new MsSqlView({
				mssqlConfig: this.config,
				config: {
					name: this.name,
					schema: this.schema,
					selectedFields: aliasedSelection,
					query: qb.getSQL().inlineParams(),
				},
			}),
			selectionProxy as any,
		) as MsSqlViewWithSelection<TName, false, AddAliasToSelection<TSelectedFields, TName, 'mssql'>>;
	}
}

export class ManualViewBuilder<
	TName extends string = string,
	TColumns extends Record<string, MsSqlColumnBuilderBase> = Record<string, MsSqlColumnBuilderBase>,
> extends ViewBuilderCore<{ name: TName; columns: TColumns }> {
	static readonly [entityKind]: string = 'MsSqlManualViewBuilder';

	private columns: Record<string, MsSqlColumn>;

	constructor(
		name: TName,
		columns: TColumns,
		schema: string | undefined,
	) {
		super(name, schema);
		this.columns = getTableColumns(mssqlTable(name, columns)) as BuildColumns<TName, TColumns, 'mssql'>;
	}

	existing(): MsSqlViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'mssql'>> {
		return new Proxy(
			new MsSqlView({
				mssqlConfig: undefined,
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
		) as MsSqlViewWithSelection<TName, true, BuildColumns<TName, TColumns, 'mssql'>>;
	}

	as(query: SQL): MsSqlViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'mssql'>> {
		return new Proxy(
			new MsSqlView({
				mssqlConfig: this.config,
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
		) as MsSqlViewWithSelection<TName, false, BuildColumns<TName, TColumns, 'mssql'>>;
	}
}

export class MsSqlView<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends MsSqlViewBase<TName, TExisting, TSelectedFields> {
	static readonly [entityKind]: string = 'MsSqlView';

	declare protected $MsSqlViewBrand: 'MsSqlView';

	[MsSqlViewConfig]: ViewBuilderConfig | undefined;

	constructor({ mssqlConfig, config }: {
		mssqlConfig: ViewBuilderConfig | undefined;
		config: {
			name: TName;
			schema: string | undefined;
			selectedFields: SelectedFields;
			query: SQL | undefined;
		};
	}) {
		super(config);
		this[MsSqlViewConfig] = mssqlConfig;
	}
}

export type MsSqlViewWithSelection<
	TName extends string,
	TExisting extends boolean,
	TSelectedFields extends ColumnsSelection,
> = MsSqlView<TName, TExisting, TSelectedFields> & TSelectedFields;

/** @internal */
export function mssqlViewWithSchema(
	name: string,
	selection: Record<string, MsSqlColumnBuilderBase> | undefined,
	schema: string | undefined,
): ViewBuilder | ManualViewBuilder {
	if (selection) {
		return new ManualViewBuilder(name, selection, schema);
	}
	return new ViewBuilder(name, schema);
}

export function mssqlView<TName extends string>(name: TName): ViewBuilder<TName>;
export function mssqlView<TName extends string, TColumns extends Record<string, MsSqlColumnBuilderBase>>(
	name: TName,
	columns: TColumns,
): ManualViewBuilder<TName, TColumns>;
export function mssqlView(
	name: string,
	selection?: Record<string, MsSqlColumnBuilderBase>,
): ViewBuilder | ManualViewBuilder {
	return mssqlViewWithSchema(name, selection, undefined);
}
