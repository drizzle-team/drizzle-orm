import { getOriginalColumnFromAlias } from '~/alias.ts';
import { Column } from '~/column.ts';
import { is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { isSQLWrapper, Param, SQL, View } from '~/sql/sql.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { ViewBaseConfig } from '~/view-common.ts';

type PgViewDependency = {
	schema: string | undefined;
	name: string;
	columns: string[];
};

type PgViewQueryConfig = {
	fields?: unknown;
	table?: unknown;
	joins?: readonly { table?: unknown; on?: unknown }[];
	where?: unknown;
	having?: unknown;
	groupBy?: readonly unknown[];
	orderBy?: readonly unknown[];
	withList?: readonly unknown[];
	distinct?: boolean | { on?: readonly unknown[] };
	setOperators?: readonly {
		rightSelect?: unknown;
		rightConfig?: PgViewQueryConfig;
		orderBy?: readonly unknown[];
	}[];
};

// Internal handoff to Drizzle Kit without exposing dependency metadata in the view API.
const PgViewDependencies = Symbol.for('drizzle:PgViewDependencies');
const PgViewDependencyConfig = Symbol.for('drizzle:PgViewDependencyConfig');

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === 'object' && value !== null;
}

function getQueryConfig(value: unknown): PgViewQueryConfig | undefined {
	if (!isObject(value)) return undefined;
	const state = value['_'];
	if (!isObject(state)) return undefined;
	const config = state['config'];
	return isObject(config) ? config : undefined;
}

function snapshotQueryConfig(config: PgViewQueryConfig): PgViewQueryConfig {
	// A dynamic query builder can be mutated after `.as()`, while the subquery SQL
	// has already been captured. Keep dependency metadata tied to that same state.
	return {
		...config,
		joins: config.joins?.map((join) => ({ ...join })),
		groupBy: config.groupBy && [...config.groupBy],
		orderBy: config.orderBy && [...config.orderBy],
		withList: config.withList && [...config.withList],
		distinct: typeof config.distinct === 'object'
			? { on: config.distinct.on && [...config.distinct.on] }
			: config.distinct,
		setOperators: config.setOperators?.map((operator) => {
			const rightConfig = getQueryConfig(operator.rightSelect);
			return {
				...operator,
				rightConfig: rightConfig && snapshotQueryConfig(rightConfig),
				orderBy: operator.orderBy && [...operator.orderBy],
			};
		}),
	};
}

/** @internal */
export function collectPgViewDependencies(
	queryBuilder: TypedQueryBuilder<ColumnsSelection | undefined>,
): PgViewDependency[] {
	const dependencies = new Map<string, {
		schema: string | undefined;
		name: string;
		columns: Set<string>;
	}>();
	const visited = new WeakSet<object>();
	const visitedConfigs = new WeakSet<object>();
	let visitConfig: (config: PgViewQueryConfig) => void;

	const addRelation = (schema: string | undefined, name: string) => {
		const key = `${schema ?? ''}\0${name}`;
		let dependency = dependencies.get(key);
		if (!dependency) {
			dependency = { schema, name, columns: new Set() };
			dependencies.set(key, dependency);
		}
		return dependency;
	};

	const addColumn = (column: Column) => {
		let original = column;
		for (;;) {
			const next = getOriginalColumnFromAlias(original);
			if (next === original) break;
			original = next;
		}

		const relation = original.table as unknown;
		if (is(relation, View)) {
			const config = relation[ViewBaseConfig];
			addRelation(config.schema, config.originalName).columns.add(original.name);
		} else if (is(relation, Table)) {
			addRelation(relation[Table.Symbol.Schema], relation[Table.Symbol.OriginalName]).columns.add(original.name);
		}
	};

	const visit = (value: unknown, selection: boolean): void => {
		if (!isObject(value)) return;

		if (is(value, Column)) {
			addColumn(value);
			return;
		}
		if (is(value, View)) {
			const config = value[ViewBaseConfig];
			addRelation(config.schema, config.originalName);
			return;
		}
		if (is(value, Table)) {
			addRelation(value[Table.Symbol.Schema], value[Table.Symbol.OriginalName]);
			if (selection) visit(value[Table.Symbol.Columns], true);
			return;
		}

		if (visited.has(value)) return;
		visited.add(value);

		if (is(value, Subquery)) {
			const config = (value as unknown as Record<symbol, unknown>)[PgViewDependencyConfig];
			if (isObject(config)) visitConfig(config);
			else {
				visit(value._.selectedFields, true);
				visit(value._.sql, false);
			}
			return;
		}
		if (is(value, Param)) {
			if (is(value.value, SQL)) visit(value.value, false);
			return;
		}
		if (is(value, SQL.Aliased)) {
			if (!value.isSelectionField) visit(value.sql, false);
			return;
		}
		if (is(value, SQL)) {
			for (const chunk of value.queryChunks) visit(chunk, false);
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) visit(item, selection);
			return;
		}
		if (isSQLWrapper(value)) {
			visit(value.getSQL(), false);
			return;
		}
		if (selection) {
			for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
				if ('value' in descriptor) visit(descriptor.value, true);
			}
		}
	};

	visitConfig = (config) => {
		if (visitedConfigs.has(config)) return;
		visitedConfigs.add(config);
		visit(config.fields, true);
		visit(config.table, false);
		for (const join of config.joins ?? []) {
			visit(join.table, false);
			visit(join.on, false);
		}
		visit(config.where, false);
		visit(config.having, false);
		visit(config.groupBy, false);
		visit(config.orderBy, false);
		visit(config.withList, false);
		if (typeof config.distinct === 'object') visit(config.distinct.on, false);
		for (const operator of config.setOperators ?? []) {
			const rightConfig = operator.rightConfig ?? getQueryConfig(operator.rightSelect);
			if (rightConfig) visitConfig(rightConfig);
			visit(operator.orderBy, false);
		}
	};

	const config = getQueryConfig(queryBuilder);
	if (config) visitConfig(config);

	return [...dependencies.values()].map(({ schema, name, columns }) => ({
		schema,
		name,
		columns: [...columns].sort(),
	}));
}

/** @internal */
export function setPgViewDependencies<T extends object>(view: T, dependencies: PgViewDependency[]): T {
	Object.defineProperty(view, PgViewDependencies, { value: dependencies });
	return view;
}

/** @internal */
export function setPgViewDependencyConfig<T extends object>(target: T, queryBuilder: unknown): T {
	const config = getQueryConfig(queryBuilder);
	if (config) Object.defineProperty(target, PgViewDependencyConfig, { value: snapshotQueryConfig(config) });
	return target;
}
