import { entityKind } from '~/entity.ts';
import type { SelectResult } from '~/query-builders/select.types.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { IsAlias, OriginalName, TableColumns, TableSchema } from '~/table.ts';
import { TableName } from '~/table.utils.ts';
import type { Equal, Update } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';

const IsDrizzleView = Symbol.for('drizzle:IsDrizzleView');

export interface ViewConfig<TSelection extends ColumnsSelection = ColumnsSelection> {
	name: string;
	schema: string | undefined;
	existing: boolean;
	selectedFields: TSelection;
	isAlias: boolean;
}

export type UpdateViewConfig<T extends ViewConfig, TUpdate extends Partial<ViewConfig>> = Required<Update<T, TUpdate>>;

export type ViewQuery<TExisting extends boolean> = TExisting extends true ? undefined : SQL;

export interface ViewTypeConfig<T extends ViewConfig> {
	readonly brand: 'View';
	readonly viewBrand: string;
	readonly name: T['name'];
	readonly schema: T['schema'];
	readonly existing: T['existing'];
	readonly selectedFields: T['selectedFields'];
	readonly isAlias: T['isAlias'];
}

/**
 * Any view with a subset of its config overridden, e.g. `AnyView<{ name: 'my_view' }>`.
 */
export type AnyView<TPartial extends Partial<ViewConfig>> = View<UpdateViewConfig<ViewConfig, TPartial>>;

export abstract class View<T extends ViewConfig = ViewConfig> {
	static readonly [entityKind]: string = 'View';

	declare _: ViewTypeConfig<T>;

	/** @internal */
	[ViewBaseConfig]: {
		name: T['name'];
		originalName: T['name'];
		schema: T['schema'];
		selectedFields: ColumnsSelection;
		isExisting: T['existing'];
		query: ViewQuery<T['existing']>;
		isAlias: boolean;
	};

	/** @internal */
	[IsDrizzleView] = true;

	/** @internal */
	public get [TableName]() {
		return this[ViewBaseConfig].name;
	}

	/** @internal */
	public get [TableSchema]() {
		return this[ViewBaseConfig].schema;
	}

	/** @internal */
	public get [IsAlias]() {
		return this[ViewBaseConfig].isAlias;
	}

	/** @internal */
	public get [OriginalName]() {
		return this[ViewBaseConfig].originalName;
	}

	/** @internal */
	public get [TableColumns]() {
		return (this[ViewBaseConfig].selectedFields) as any as Record<string, unknown>;
	}

	declare readonly $inferSelect: InferViewSelectModel<View<T>>;

	constructor(
		{ name, schema, selectedFields, query }: {
			name: T['name'];
			schema: T['schema'];
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		},
	) {
		this[ViewBaseConfig] = {
			name,
			originalName: name,
			schema,
			selectedFields,
			query: query as ViewQuery<T['existing']>,
			isExisting: !query as T['existing'],
			isAlias: false,
		};
	}
}

export function isView(view: unknown): view is View {
	return typeof view === 'object' && view !== null && IsDrizzleView in view;
}

export function getViewName<T extends View>(view: T): T['_']['name'] {
	return view[ViewBaseConfig].name;
}

export type InferViewSelectModel<TView extends View<any>> =
	Equal<TView['_']['selectedFields'], { [x: string]: unknown }> extends true ? { [x: string]: unknown }
		: SelectResult<
			TView['_']['selectedFields'],
			'single',
			Record<TView['_']['name'], 'not-null'>
		>;
