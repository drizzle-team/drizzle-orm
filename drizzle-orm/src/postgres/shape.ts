import {
	Collect,
	CollectNullable,
	type CustomMarker,
	Json,
	JsonArray,
	type JsonMarker,
	type JsonSpec,
	Nullable,
	type ShapeSpec,
	type TableShape,
	Transform,
	type TransformMarker,
	type TypeSpec,
} from 'minipg';
import { geometry as pgGeometry } from 'minipg/geometry';
import { getOriginalColumnFromAlias } from '~/alias.ts';
import { Column } from '~/column.ts';
import { is } from '~/entity.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import type { PostgresType } from '~/pg-core/codecs.ts';
import type { PgColumn } from '~/pg-core/columns/common.ts';
import type { PreparedQuerySelection } from '~/pg-core/dialect.ts';
import { type DriverValueDecoder, SQL, type SQLWrapper, type View } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { getColumnFromDecoder, getColumns, orderSelectedFields } from '~/utils.ts';

type ShapeType = [element: string, as?: string];

type WireSpec = TypeSpec | CustomMarker;

const SHAPE_TYPES: Partial<Record<PostgresType, ShapeType>> = {
	smallint: ['int2'],
	smallserial: ['int2'],
	int: ['int4'],
	serial: ['int4'],
	bigint: ['int8', 'bigint'],
	'bigint:number': ['int8', 'number'],
	'bigint:string': ['int8', 'string'],
	bigserial: ['int8', 'bigint'],
	'bigserial:number': ['int8', 'number'],
	numeric: ['numeric'],
	'numeric:number': ['numeric', 'number'],
	'numeric:bigint': ['numeric', 'bigint'],
	float4: ['float4'],
	float8: ['float8'],
	money: ['money'],
	char: ['bpchar'],
	varchar: ['varchar'],
	text: ['text'],
	bytea: ['bytea'],
	date: ['date', 'date'],
	'date:string': ['date', 'string'],
	time: ['time'],
	timestamp: ['timestamp', 'date'],
	'timestamp:string': ['timestamp', 'string'],
	timestamptz: ['timestamptz', 'date'],
	'timestamptz:string': ['timestamptz', 'string'],
	interval: ['interval'],
	'interval:tuple': ['interval'],
	bool: ['bool'],
	uuid: ['uuid'],
	json: ['json'],
	jsonb: ['jsonb'],
	oid: ['oid'],
	point: ['point', 'xy'],
	'point:tuple': ['point', 'tuple'],
	line: ['line', 'abc'],
	'line:tuple': ['line', 'tuple'],
	vector: ['vector', 'array'],
	halfvec: ['halfvec', 'array'],
	sparsevec: ['sparsevec', 'string'],
};

/** Types minipg decodes only through a registry marker, which carries no spec string to name it by. */
const CUSTOM_MARKERS: Partial<Record<PostgresType, { scalar: CustomMarker; array: CustomMarker }>> = {
	'geometry(point)': {
		scalar: pgGeometry('xy'),
		array: pgGeometry.array('xy'),
	},
	'geometry(point):tuple': {
		scalar: pgGeometry('tuple'),
		array: pgGeometry.array('tuple'),
	},
};

const TEXT: ShapeType = ['text'];

/** The spec a codec type declares by name, at `dimensions` array depth. Anything unmapped reads as text. */
function namedSpecFor(codecType: PostgresType, dimensions: number | undefined): TypeSpec {
	const [element, as] = SHAPE_TYPES[codecType] ?? TEXT;
	const pg = dimensions ? `${element}[]` : element;
	return (as ? `${pg}:${as}` : pg) as TypeSpec;
}

/** What a codec type declares on the wire, at `dimensions` array depth. Includes Markers not supported in JSON shape. */
function wireSpecFor(codecType: PostgresType, dimensions: number | undefined): WireSpec {
	const custom = CUSTOM_MARKERS[codecType];
	if (custom) return dimensions ? custom.array : custom.scalar;

	return namedSpecFor(codecType, dimensions);
}

type RelationalSelection = Extract<PreparedQuerySelection, { type: 'relational' }>['fields'];
type RelationalItem = RelationalSelection[number];
type RelationalItemDecodedField = Exclude<RelationalItem['field'], Table | View>;

function getDecoder(field: SelectedFieldsOrdered<Column>[number]['field']): DriverValueDecoder<any, any> {
	if (is(field, Column)) return field;
	if (is(field, SQL)) return field.decoder;
	if (is(field, Subquery)) return field._.sql.decoder;
	return field.sql.decoder;
}

function getRqbDecoder(field: RelationalItemDecodedField): DriverValueDecoder<any, any> {
	if (is(field, Column)) return field;
	return field.getSQL().decoder;
}

function getRqbColumn(field: RelationalItemDecodedField): Column | undefined {
	return is(field, Column) ? field : getColumnFromDecoder(field as SQL | SQL.Aliased | SQLWrapper);
}

const transformCache = new WeakMap<object, Map<string, { codec: unknown; marker: TransformMarker }>>();

const markerKeys = new WeakMap<CustomMarker, string>();
let nextMarkerKey = 0;

/** Marker can't be stringified directly to acquire key */
function specKey(spec: WireSpec): string {
	if (typeof spec === 'string') return spec;

	let key = markerKeys.get(spec);
	if (!key) markerKeys.set(spec, key = `marker:${++nextMarkerKey}`);
	return key;
}

function memoizedTransform(
	decoderKey: object,
	spec: WireSpec,
	codec: unknown,
	dimensions: number | undefined,
	build: () => TransformMarker,
): TransformMarker {
	let byKey = transformCache.get(decoderKey);
	if (!byKey) transformCache.set(decoderKey, byKey = new Map());

	const cacheKey = `${specKey(spec)}\u0000${dimensions ?? 0}`;
	const cached = byKey.get(cacheKey);
	if (cached && cached.codec === codec) return cached.marker;

	const marker = build();
	byKey.set(cacheKey, { codec, marker });
	return marker;
}

function leafFor(
	decoder: DriverValueDecoder<any, any>,
	spec: WireSpec,
	dimensions: number | undefined,
): WireSpec | TransformMarker {
	if (decoder.mapFromDriverValue.isNoop) return spec;

	const key = is(decoder, Column) ? getOriginalColumnFromAlias(decoder) : decoder.mapFromDriverValue;
	const decode = decoder.mapFromDriverValue.bind(decoder);

	return memoizedTransform(key, spec, undefined, dimensions, () => Transform(spec as TypeSpec, decode));
}

function wireLeaf(
	decoder: DriverValueDecoder<any, any>,
	column: Column | undefined,
	codecOverride: string | undefined,
	arrayDimensions: number | undefined,
): WireSpec | TransformMarker {
	const codecType = column ? (codecOverride ?? column.codec) as PostgresType | undefined : undefined;
	const spec: WireSpec = codecType ? wireSpecFor(codecType, arrayDimensions) : 'unknown';

	return leafFor(decoder, spec, arrayDimensions);
}

type ShapeEntry = ShapeSpec[string];

interface PlainLeaf {
	path: readonly string[];
	leaf: WireSpec | TransformMarker;
	column: Column | undefined;
}

function groupIsNullable(
	leaves: PlainLeaf[],
	joinsNotNullableMap: Record<string, boolean> | undefined,
): boolean {
	if (!joinsNotNullableMap) return false;

	let table: string | undefined;
	for (const { column } of leaves) {
		if (!column) continue;
		const name = getTableName(column.table);
		if (table === undefined) table = name;
		else if (table !== name) return false;
	}

	return table !== undefined && !joinsNotNullableMap[table];
}

function assembleGroupBody(
	leaves: PlainLeaf[],
	depth: number,
	nullableLeaves: boolean,
): ShapeSpec {
	const order: string[] = [];
	const directLeaves = new Map<string, ShapeEntry>();
	const groups = new Map<string, PlainLeaf[]>();

	for (const leaf of leaves) {
		const key = leaf.path[depth]!;
		if (leaf.path.length === depth + 1) {
			if (!directLeaves.has(key)) order.push(key);
			directLeaves.set(key, nullableLeaves ? Nullable(leaf.leaf) : leaf.leaf);
			continue;
		}
		let nested = groups.get(key);
		if (!nested) {
			groups.set(key, nested = []);
			order.push(key);
		}
		nested.push(leaf);
	}

	const spec: ShapeSpec = {};
	for (const key of order) {
		const nested = groups.get(key);
		spec[key] = nested ? Collect(assembleGroupBody(nested, depth + 1, false)) : directLeaves.get(key)!;
	}
	return spec;
}

const JSON_LEAF: TypeSpec = 'unknown';

function jsonSpecForField(field: RelationalItemDecodedField, arrayDimensions: number | undefined): TypeSpec {
	const codecType = getRqbColumn(field)?.codec as PostgresType | undefined;

	if (!codecType) return JSON_LEAF;
	// Parse jsons of unknown shape as 'unknown' type
	if (codecType === 'json' || codecType === 'jsonb') return JSON_LEAF;

	return namedSpecFor(codecType, arrayDimensions);
}

function jsonLeafFor(item: RelationalItem): TypeSpec | TransformMarker {
	const { field, codec, arrayDimensions } = item;

	const mapFromJsonValue = (<{ mapFromJsonValue?: (value: unknown) => unknown }> field).mapFromJsonValue;
	const decoder = getRqbDecoder(field as RelationalItemDecodedField);
	const isNoop = decoder.mapFromDriverValue.isNoop;

	if (!mapFromJsonValue && !codec && isNoop) {
		return jsonSpecForField(field as RelationalItemDecodedField, arrayDimensions);
	}

	const spec = codec ? JSON_LEAF : jsonSpecForField(field as RelationalItemDecodedField, arrayDimensions);
	const key = is(field, Column) ? getOriginalColumnFromAlias(field) : (mapFromJsonValue ?? decoder.mapFromDriverValue);
	return memoizedTransform(key, spec, mapFromJsonValue ?? codec, arrayDimensions, () => {
		const fn = mapFromJsonValue
			? (value: any) => mapFromJsonValue(value)
			: isNoop
			? (value: any) => codec!(value, arrayDimensions!)
			: codec
			? (value: any) => decoder.mapFromDriverValue(codec(value, arrayDimensions!))
			: (value: any) => decoder.mapFromDriverValue(value);

		return Transform(spec, fn);
	});
}

function jsonSpecFor(selection: RelationalSelection): JsonSpec {
	const spec: JsonSpec = {};

	for (const item of selection) {
		spec[item.key] = item.selection ? jsonMarkerFor(item) : jsonLeafFor(item);
	}

	return spec;
}

function jsonMarkerFor(item: RelationalItem): JsonMarker {
	const spec = jsonSpecFor(item.selection!);
	return item.isArray ? JsonArray(spec) : Json(spec);
}

function relationalShape(selection: RelationalSelection): ShapeSpec {
	const root: ShapeSpec = {};

	for (const item of selection) {
		if (item.selection) {
			root[item.key] = jsonMarkerFor(item);
			continue;
		}

		const field = item.field as RelationalItemDecodedField;
		root[item.key] = wireLeaf(
			getRqbDecoder(field),
			getRqbColumn(field),
			undefined,
			item.arrayDimensions,
		);
	}

	return root;
}

export function buildShape(
	selection: PreparedQuerySelection,
	joinsNotNullableMap?: Record<string, boolean>,
): ShapeSpec {
	if (selection.type === 'relational') return relationalShape(selection.fields);

	const { fields } = selection;
	if (!fields.length) return {};

	const order: string[] = [];
	const rootLeaves = new Map<string, ShapeEntry>();
	const groups = new Map<string, PlainLeaf[]>();

	for (let i = 0; i < fields.length; ++i) {
		const { path, field, column, codecOverride, arrayDimensions } = fields[i]!;
		const leaf = wireLeaf(getDecoder(field), column, codecOverride, arrayDimensions);

		const key = path[0]!;
		if (path.length === 1) {
			if (!rootLeaves.has(key)) order.push(key);
			rootLeaves.set(key, leaf);
			continue;
		}

		let group = groups.get(key);
		if (!group) {
			groups.set(key, group = []);
			order.push(key);
		}
		group.push({ path, leaf, column: is(field, Column) ? field : undefined });
	}

	const root: ShapeSpec = {};
	for (const key of order) {
		const group = groups.get(key);
		if (!group) {
			root[key] = rootLeaves.get(key)!;
			continue;
		}

		const nullable = groupIsNullable(group, joinsNotNullableMap);
		const body = assembleGroupBody(group, 1, nullable);
		root[key] = nullable ? CollectNullable(body) : Collect(body);
	}

	return root;
}

export namespace buildShape {
	export function fromTableOrView(source: Table): TableShape;
	export function fromTableOrView(source: View): TableShape;
	export function fromTableOrView(
		source: Table | View,
	): TableShape {
		const columns = getColumns(source);
		const fields = orderSelectedFields<PgColumn>(columns);
		const jsDbNameMap = is(source, Table)
			? Object.fromEntries(
				Object.entries(columns as Record<string, Column>).reduce<[string, string][]>((p, [k, c]) => {
					const { name } = c;
					if (k === name) return p;

					p.push([k, name]);
					return p;
				}, []),
			)
			: undefined;

		return {
			shape: buildShape({ type: 'plain', fields }) as TableShape['shape'],
			schema: source[Table.Symbol.Schema],
			table: source[Table.Symbol.OriginalName],
			columns: jsDbNameMap,
		};
	}
}
