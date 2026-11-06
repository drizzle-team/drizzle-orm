import type { Footprint } from '../commutativity/engine';
import { normalizeDDL } from '../dialects/ddl-canonical';
import { type DDL, type Delta, parseEntityKey, type Row } from '../dialects/dialect';
import { array, validator } from '../dialects/simpleValidator';

// The shape of a snapshot of the delta format. `version` and `dialect` are literal types of a dialect, and the
// entity rows come from its DDL.
export type BaseSnapshot<TRow, TVersion extends string, TDialect extends string> = {
	type: 'base';
	version: TVersion;
	dialect: TDialect;
	id: string;
	prevIds: string[];
	footprints: Footprint[];
	ddl: TRow[];
};

export type DiffSnapshot<TVersion extends string, TDialect extends string> = {
	type: 'diff';
	version: TVersion;
	dialect: TDialect;
	id: string;
	prevIds: string[];
	footprints: Footprint[];
	deltas: Delta[];
};

export type DeltaSnapshot<TRow, TVersion extends string, TDialect extends string> =
	| BaseSnapshot<TRow, TVersion, TDialect>
	| DiffSnapshot<TVersion, TDialect>;

// What the shared validators need to know about a dialect: the two literals of its snapshots and how to check an
// entity row and an entity type.
export type DeltaFormat<TRow extends Row, TVersion extends string, TDialect extends string> = {
	version: TVersion;
	dialect: TDialect;
	hasEntityType: (type: string) => boolean;
	hasEntityField: (type: string, field: string) => boolean;
	validateEntity: (row: unknown) => row is TRow;
};

const isStringList = (it: unknown): it is string[] =>
	Array.isArray(it) && it.every((value) => typeof value === 'string');

const footprintFields = new Set(['statementType', 'statementTarget', 'writes', 'reads', 'sharedWrites', 'sqlHash']);

export const isFootprint = (it: any): it is Footprint =>
	typeof it === 'object' && it !== null && !Array.isArray(it)
	&& Object.keys(it).every((field) => footprintFields.has(field))
	&& typeof it.statementType === 'string'
	&& isStringList(it.statementTarget) && it.statementTarget.length >= 2
	&& isStringList(it.writes)
	&& (it.reads === undefined || isStringList(it.reads))
	&& (it.sharedWrites === undefined || isStringList(it.sharedWrites))
	&& (it.sqlHash === undefined || typeof it.sqlHash === 'string');

// Checks the `footprints` field of both snapshot types: one footprint for each statement of the migration.
const footprints = array(isFootprint);

// Builds the delta and the footprint checks and the two snapshot validators of a dialect. `isDelta` checks the
// four delta operations against the entity definitions of the dialect.
export const deltaFormatValidators = <TRow extends Row, TVersion extends string, TDialect extends string>(
	format: DeltaFormat<TRow, TVersion, TDialect>,
) => {
	const isDelta = (it: any): it is Delta => {
		if (it?.op === 'create') return format.hasEntityType(it.row?.entityType) && format.validateEntity(it.row);
		if (!['drop', 'alter', 'rename'].includes(it?.op)) return false;
		if (typeof it.key !== 'string' || !it.key.includes('\0')) return false;
		const [type] = parseEntityKey(it.key);
		if (!format.hasEntityType(type)) return false;
		if (it.op === 'drop') return true;
		return typeof it.set === 'object' && it.set !== null
			&& Object.keys(it.set).every((field) => format.hasEntityField(type, field));
	};

	const baseValidator = validator({
		type: ['base'],
		version: [format.version],
		dialect: [format.dialect],
		id: 'string',
		prevIds: array((it) => typeof it === 'string'),
		ddl: array(format.validateEntity),
		footprints,
	});

	const diffValidator = validator({
		type: ['diff'],
		version: [format.version],
		dialect: [format.dialect],
		id: 'string',
		prevIds: array((it) => typeof it === 'string'),
		deltas: array(isDelta),
		footprints,
	});

	return { isDelta, baseValidator, diffValidator };
};

const entityName = (json: string) => {
	const row = JSON.parse(json);
	return `${row.entityType} ${[row.schema, row.table, row.name].filter(Boolean).join('.')}`;
};

// Gives the name of the first entity that differs between two states, or undefined when they are equal. `up`
// uses it to check each converted snapshot against the state that its old snapshot held.
export const stateDifference = (
	expected: Pick<DDL, 'entities'>,
	reconstructed: Pick<DDL, 'entities'>,
): string | undefined => {
	const [a, b] = [normalizeDDL(expected.entities.list()), normalizeDDL(reconstructed.entities.list())];
	const [inA, inB] = [new Set(a), new Set(b)];
	const differing = a.find((it) => !inB.has(it)) ?? b.find((it) => !inA.has(it));
	return differing === undefined ? undefined : entityName(differing);
};
