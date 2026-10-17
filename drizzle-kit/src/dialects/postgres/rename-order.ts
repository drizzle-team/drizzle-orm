import type { PostgresDDL } from './ddl';

/*
	In PostgreSQL, tables, views, sequences and indexes share one name space per schema.
	A primary key and a unique constraint own an index with their name, so they share it too.

	A rename that takes a name which is still held at that point of the migration fails with
	`relation "..." already exists`. The helpers below pick the order of the rename statements
	so that every rename takes a free name, and fall back to a temporary name when no order works.
*/

// postgres truncates identifiers to NAMEDATALEN - 1 bytes
const maxIdentifierLength = 63;

const key = (schema: string, name: string) => `${schema}\u0000${name}`;

export const relationNames = (ddl: PostgresDDL) => {
	const names = new Set<string>();
	const entities = [
		...ddl.tables.list(),
		...ddl.views.list(),
		...ddl.sequences.list(),
		...ddl.indexes.list(),
		...ddl.pks.list(),
		...ddl.uniques.list(),
	];
	for (const it of entities) {
		names.add(key(it.schema, it.name));
	}
	return names;
};

export class RelationNamespace {
	private readonly reserved = new Set<string>();

	constructor(private readonly before: Set<string>, private readonly after: Set<string>) {}

	// A name is free when no relation holds it before or after the migration,
	// and no other rename of this migration holds it in between
	isFree(schema: string, name: string) {
		const k = key(schema, name);
		return !this.before.has(k) && !this.after.has(k) && !this.reserved.has(k);
	}

	reserve(schema: string, name: string) {
		this.reserved.add(key(schema, name));
	}

	tempName(schemas: string[], base: string) {
		for (let i = 0;; i++) {
			const suffix = i === 0 ? '_tmp' : `_tmp${i}`;
			const name = `${base.slice(0, maxIdentifierLength - suffix.length)}${suffix}`;
			if (schemas.every((schema) => this.isFree(schema, name))) {
				for (const schema of schemas) this.reserve(schema, name);
				return name;
			}
		}
	}
}

export type MoveOrder =
	| { type: 'rename-first' }
	| { type: 'move-first' }
	| { type: 'temp'; name: string };

/*
	A move to another schema with a new name takes two statements, and the relation holds a third name between them:
	- rename first: the new name in the old schema
	- move first: the old name in the new schema
	The preferred order is used when its third name is free, then the other order,
	then a temporary name that is free in both schemas.
*/
export const moveOrder = (
	namespace: RelationNamespace,
	from: { schema: string; name: string },
	to: { schema: string; name: string },
	prefer: 'rename-first' | 'move-first',
): MoveOrder => {
	const options = [
		{ type: 'rename-first' as const, schema: from.schema, name: to.name },
		{ type: 'move-first' as const, schema: to.schema, name: from.name },
	];
	if (prefer === 'move-first') options.reverse();

	for (const option of options) {
		if (namespace.isFree(option.schema, option.name)) {
			namespace.reserve(option.schema, option.name);
			return { type: option.type };
		}
	}

	return { type: 'temp', name: namespace.tempName([from.schema, to.schema], from.name) };
};

/*
	Orders the renames of relations within one schema so that a rename which frees a name
	runs before the rename which takes it. Renames that form a cycle go through a temporary name.
*/
export const orderRenames = <T>(
	namespace: RelationNamespace,
	renames: { schema: string; from: string; to: string; statement: (from: string, to: string) => T }[],
): T[] => {
	const pending = renames.map((it) => ({ ...it }));
	const result: T[] = [];

	while (pending.length > 0) {
		const index = pending.findIndex((it) =>
			!pending.some((other) => other !== it && other.schema === it.schema && other.from === it.to)
		);

		if (index !== -1) {
			const [it] = pending.splice(index, 1);
			result.push(it!.statement(it!.from, it!.to));
			continue;
		}

		// every pending rename takes a name that another pending rename holds
		const it = pending[0]!;
		const temp = namespace.tempName([it.schema], it.from);
		result.push(it.statement(it.from, temp));
		it.from = temp;
	}

	return result;
};
