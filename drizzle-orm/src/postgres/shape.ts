import {
	Collect,
	type CollectMarker,
	CollectNullable,
	Nullable,
	type ShapeSpec,
	Transform,
	type TransformMarker,
	type TypeSpec,
} from 'minipg';
import { CodecsCollection, type NormalizeArrayCodec, type NormalizeCodec } from '~/codecs.ts';
import { Column } from '~/column.ts';
import { is } from '~/entity.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import { arrayCompatNormalize, type PostgresType, resolvePgTypeAlias } from '~/pg-core/codecs.ts';
import type { PgColumn } from '~/pg-core/columns/index.ts';
import type { PreparedQuerySelection } from '~/pg-core/dialect';
import { type DriverValueDecoder, SQL, type View } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { getTableName, type Table } from '~/table.ts';
import { getColumns, orderSelectedFields } from '~/utils.ts';
import { miniPgCodecs } from './codecs.ts';

type ShapeType = [element: string, js?: string, driverNormalized?: true];

const SHAPE_TYPES: Partial<Record<PostgresType, ShapeType>> = {
	smallint: ['int2'],
	smallserial: ['int2'],
	int: ['int4'],
	serial: ['int4'],
	bigint: ['int8'],
	'bigint:number': ['int8'],
	'bigint:string': ['int8'],
	bigserial: ['int8'],
	'bigserial:number': ['int8'],
	numeric: ['numeric'],
	'numeric:number': ['numeric'],
	'numeric:bigint': ['numeric'],
	float4: ['float4'],
	float8: ['float8'],
	money: ['money'],
	char: ['bpchar'],
	varchar: ['varchar'],
	text: ['text'],
	bytea: ['bytea'],
	date: ['date', 'string'],
	'date:string': ['date', 'string'],
	time: ['time'],
	timestamp: ['timestamp', 'string'],
	'timestamp:string': ['timestamp', 'string'],
	timestamptz: ['timestamptz', 'string'],
	'timestamptz:string': ['timestamptz', 'string'],
	interval: ['interval'],
	'interval:tuple': ['interval'],
	bool: ['bool'],
	uuid: ['uuid'],
	json: ['json'],
	jsonb: ['jsonb'],
	oid: ['oid'],
	point: ['point', 'xy', true],
	'point:tuple': ['point', 'tuple', true],
	vector: ['vector', 'array', true],
	halfvec: ['halfvec', 'array', true],
	sparsevec: ['sparsevec', 'string'],
	box2d: ['box2d', 'string'],
	box3d: ['box3d', 'string'],
};

const TEXT: ShapeType = ['text'];

const KNOWN_ARRAY_TYPES = new Set([
	'int2',
	'int4',
	'int8',
	'oid',
	'float4',
	'float8',
	'numeric',
	'money',
	'bool',
	'bpchar',
	'varchar',
	'text',
	'bytea',
	'uuid',
	'date',
	'time',
	'timestamp',
	'timestamptz',
	'interval',
	'json',
	'jsonb',
]);

function typeSpecFor(element: string, js: string | undefined, dimensions: number | undefined): TypeSpec {
	if (!dimensions) return (js ? `${element}:${js}` : element) as TypeSpec;
	if (!KNOWN_ARRAY_TYPES.has(element)) return 'text[]';
	return (js ? `${element}[]:${js}` : `${element}[]`) as TypeSpec;
}

const arrayNormalizers = new WeakMap<NormalizeCodec, NormalizeArrayCodec>();
function getCachedArrayNormalizer(item: NormalizeCodec): NormalizeArrayCodec {
	let lifted = arrayNormalizers.get(item);
	if (!lifted) arrayNormalizers.set(item, lifted = arrayCompatNormalize(item));
	return lifted;
}

function getDecoder(field: SelectedFieldsOrdered<Column>[number]['field']): DriverValueDecoder<any, any> {
	if (is(field, Column)) return field;
	if (is(field, SQL)) return field.decoder;
	if (is(field, Subquery)) return field._.sql.decoder;
	return field.sql.decoder;
}

const transformCache = new WeakMap<object, Map<TypeSpec, { codec: unknown; marker: TransformMarker }>>();
function getTransformer(
	decoder: DriverValueDecoder<any, any>,
	codec: NormalizeCodec | undefined,
	dimensions: number | undefined,
): (value: any) => unknown {
	const normalize = !codec
		? undefined
		: dimensions
		? (value: any) => getCachedArrayNormalizer(codec)(value, dimensions)
		: codec;

	if (decoder.mapFromDriverValue.isNoop) return normalize!;

	const decode = decoder.mapFromDriverValue.bind(decoder);
	return normalize ? (value: any) => decode(normalize(value)) : decode;
}

function leafFor(
	decoder: DriverValueDecoder<any, any>,
	spec: TypeSpec,
	codec: NormalizeCodec | undefined,
	dimensions: number | undefined,
): TypeSpec | TransformMarker {
	if (!codec && decoder.mapFromDriverValue.isNoop) return spec;

	const key = is(decoder, Column) ? decoder : decoder.mapFromDriverValue;
	let bySpec = transformCache.get(key);
	if (!bySpec) transformCache.set(key, bySpec = new Map());

	const cached = bySpec.get(spec);
	if (cached && cached.codec === codec) return cached.marker;

	const marker = Transform(spec, getTransformer(decoder, codec, dimensions));
	bySpec.set(spec, { codec: codec, marker });
	return marker;
}

interface GroupPlan {
	nullable: boolean;
	required: ReadonlySet<number>;
}

const NO_LEAVES: ReadonlySet<number> = new Set();
function planGroups(
	fields: SelectedFieldsOrdered<Column>,
	joinsNotNullableMap: Record<string, boolean> | undefined,
): Map<string, GroupPlan> | undefined {
	const groups = new Map<string, number[]>();

	for (const [index, { path }] of fields.entries()) {
		if (path.length !== 2) continue;
		const group = groups.get(path[0]!);
		if (group) group.push(index);
		else groups.set(path[0]!, [index]);
	}

	const plans = new Map<string, GroupPlan>();

	for (const [name, leaves] of groups) {
		const columns = leaves.filter((index) => is(fields[index]!.field, Column));
		const tables = new Set(columns.map((index) => getTableName((fields[index]!.field as Column).table)));

		const [table] = tables;
		if (!joinsNotNullableMap || tables.size !== 1 || joinsNotNullableMap[table!]) {
			plans.set(name, { nullable: false, required: NO_LEAVES });
			continue;
		}

		const required = new Set(columns.filter((index) => (fields[index]!.field as Column).notNull));
		if (!required.size && columns.length !== leaves.length) return undefined;

		plans.set(name, { nullable: true, required });
	}

	return plans;
}

const defaultCodecs = new CodecsCollection<PostgresType>(resolvePgTypeAlias, miniPgCodecs);

export function buildShape(
	selection: PreparedQuerySelection,
	joinsNotNullableMap?: Record<string, boolean>,
	codecs: CodecsCollection<PostgresType> = defaultCodecs,
): ShapeSpec | undefined {
	// TODO: RQB
	if (selection.type !== 'plain') return undefined;

	const { fields } = selection;
	// Deep objects aren't supported
	if (!fields.length || fields.some(({ path }) => path.length > 2)) return undefined;

	const plans = planGroups(fields, joinsNotNullableMap);
	if (!plans) return undefined;

	const root: ShapeSpec = {};
	const groups = new Map<string, ShapeSpec>();

	for (const [index, { path, field, column, codecOverride, arrayDimensions }] of fields.entries()) {
		const codecType = column ? (codecOverride ?? column.codec) as PostgresType | undefined : undefined;

		let spec: TypeSpec = 'unknown';
		let item: NormalizeCodec | undefined;
		if (codecType) {
			const [element, js, driverNormalized] = SHAPE_TYPES[codecType] ?? TEXT;
			spec = typeSpecFor(element, js, arrayDimensions);
			// An array falls back to `text[]`, whose items minipg hands over as strings, so the codec still runs.
			if (!driverNormalized || arrayDimensions) item = codecs.codecs[codecType]?.normalize;
		}

		const leaf = leafFor(getDecoder(field), spec, item, arrayDimensions);

		if (path.length === 1) {
			root[path[0]!] = leaf;
			continue;
		}

		const [group, key] = path as [string, string];
		const plan = plans.get(group)!;
		let nested = groups.get(group);
		if (!nested) {
			groups.set(group, nested = {});
			root[group] = (plan.nullable ? CollectNullable(nested) : Collect(nested)) as CollectMarker;
		}

		nested[key] = plan.nullable && !plan.required.has(index) ? Nullable(leaf) : leaf;
	}

	return root;
}

export namespace buildShape {
	export function fromTableOrView(source: Table, codecs?: CodecsCollection<PostgresType>): ShapeSpec;
	export function fromTableOrView(source: View, codecs?: CodecsCollection<PostgresType>): ShapeSpec | undefined;
	export function fromTableOrView(
		source: Table | View,
		codecs: CodecsCollection<PostgresType> = defaultCodecs,
	): ShapeSpec | undefined {
		const fields = orderSelectedFields<PgColumn>(getColumns(source), undefined, codecs);
		return buildShape({ type: 'plain', fields }, undefined, codecs);
	}
}
