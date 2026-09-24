/**
 * Rewrites a postgres migrations folder from "every snapshot carries the whole
 * ddl" into base + diff form:
 *
 *   - the root snapshot keeps its `ddl` and is tagged `type: 'base'`
 *   - every other snapshot drops `ddl` entirely and instead carries
 *     `type: 'diff'`, the `statements` (alters) that produce it, and `basedOn`
 *
 * Every diff is "an anchor plus the statements relative to it". `basedOn` names
 * that anchor: for a linear node it is simply the parent; for a merge node it is
 * the FORK POINT — the lowest common ancestor of its parents — and the statements
 * are then the branches' changes composed with whatever the merge itself added.
 *
 * So `basedOn` is not necessarily one of `prevIds`; it is an ancestor. That is the
 * point. A merge node's real parent state is the composition of all its branches,
 * which exists in no file, and anchoring at any single parent would be an
 * arbitrary choice that silently attributes the sibling branches' work to the
 * merge. The fork point is canonical (symmetric across every branch) and is a
 * real node already in the graph, so the writer resolves it once here and readers
 * only follow it — nothing downstream needs to know a merge happened, or to
 * recompute an LCA.
 *
 * `prevIds` is untouched and still describes the DAG for commutativity; `basedOn`
 * is purely about reconstructing state.
 *
 * Reconstructing is then: start at a `base`/`checkpoint`, follow `basedOn`, replay
 * `statements` with `generateLatestSnapshot` — the same function the branch-merge
 * path in the serializers already uses.
 *
 * Dry-run by default. Nothing is written without `--write`.
 *
 *   pnpm tsx scripts/snapshots-to-diffs.ts --out=./drizzle
 *   pnpm tsx scripts/snapshots-to-diffs.ts --out=./drizzle --write
 *   pnpm tsx scripts/snapshots-to-diffs.ts --out=./drizzle --merge=checkpoint
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { normalizeDDL } from '../src/dialects/ddl-canonical';
import { apply, type Delta, delta } from '../src/dialects/dialect';
import { createDDL } from '../src/dialects/postgres/ddl';
import { ddlDiff } from '../src/dialects/postgres/diff';
import { generateLatestSnapshot } from '../src/dialects/postgres/serializer';
import type { PostgresSnapshot } from '../src/dialects/postgres/snapshot';
import type { JsonStatement } from '../src/dialects/postgres/statements';
import { mockResolver } from '../src/utils/mocks';

// Loose ddl-row alias for this script's report/compare helpers (describeEntity, fieldDiff,
// ddlMismatch). The engine's structural fns operate on Row[] = Record<string, any>[].
type Entity = Record<string, any>;

const ORIGIN = '00000000-0000-0000-0000-000000000000';

type Node = {
	id: string;
	prevIds: string[];
	path: string;
	folder: string;
	raw: PostgresSnapshot;
};

/**
 * A snapshot that carries state outright. `base` is the root; `checkpoint` is a
 * mid-history anchor. A reader treats them identically — "stop walking, read the
 * ddl" — the tag only records provenance.
 */
type StateFile = {
	type: 'base' | 'checkpoint';
	version: string;
	dialect: string;
	id: string;
	prevIds: string[];
	renames: string[];
	ddl: unknown[];
};

type DiffFile = {
	type: 'diff';
	version: string;
	dialect: string;
	id: string;
	prevIds: string[];
	/**
	 * The node the payload below is relative to: the parent for a linear node, the
	 * fork point for a merge. An ancestor, not necessarily one of `prevIds`.
	 */
	basedOn: string;
	renames: string[];
	/** `--format=statements`: semantic, needs an interpreter to replay. */
	statements?: JsonStatement[];
	/** `--format=structural`: keyed set ops, needs nothing to replay. */
	deltas?: Delta[];
};

type Format = 'structural' | 'statements';

type EmittedFile = StateFile | DiffFile;

/**
 * What to do with a node whose `prevIds` name more than one parent.
 *
 * `fork` (default) anchors the node at its fork point — the lowest common
 * ancestor of its parents — and stores diff(fork -> node), which is the branches'
 * changes composed plus whatever the merge itself added. The anchor is canonical
 * (symmetric across every branch, unlike "the first parent") and is a real node
 * already in the graph, so the writer resolves it once and the reader only ever
 * follows it. That keeps every node a uniform "anchor + statements" and means
 * nothing downstream has to know a merge happened.
 *
 * `checkpoint` writes the node's state outright instead. Simplest to read, but
 * costs a full ddl per merge.
 *
 * `basedon` diffs against the first parent: smallest, but the choice of parent is
 * arbitrary and the statements silently carry the sibling branches' work.
 */
type MergeStrategy = 'fork' | 'checkpoint' | 'basedon';

const fail = (message: string): never => {
	console.error(`\n  ✗ ${message}\n`);
	process.exit(1);
};

// ---------------------------------------------------------------- comparison

const describeEntity = (text: string): string => {
	try {
		const e = JSON.parse(text) as Record<string, unknown>;
		const parts = [e['entityType'], e['schema'], e['table'], e['name']].filter(Boolean);
		return parts.join('.') || text.slice(0, 80);
	} catch {
		return text.slice(0, 80);
	}
};

/** Field-level difference between two entities that share an identity. */
const fieldDiff = (expected: string, actual: string): string[] => {
	const e = JSON.parse(expected) as Record<string, unknown>;
	const a = JSON.parse(actual) as Record<string, unknown>;
	const out: string[] = [];
	for (const key of new Set([...Object.keys(e), ...Object.keys(a)])) {
		const l = JSON.stringify(e[key]);
		const r = JSON.stringify(a[key]);
		if (l !== r) out.push(`${key}: expected ${l}, replayed ${r}`);
	}
	return out;
};

/**
 * Returns a human-readable report of how two ddls differ, or null when equal.
 *
 * Entities are paired by identity first, so the common failure — an entity that
 * survives replay but with a corrupted field — reports as a field diff rather
 * than as an unrelated add/remove pair.
 */
const ddlMismatch = (expected: Entity[], actual: Entity[]): string | null => {
	const a = normalizeDDL(expected);
	const b = normalizeDDL(actual);
	if (a.length === b.length && a.every((x, i) => x === b[i])) return null;

	const inB = new Set(b);
	const inA = new Set(a);
	const missing = a.filter((x) => !inB.has(x));
	const extra = b.filter((x) => !inA.has(x));

	const extraByKey = new Map(extra.map((x) => [describeEntity(x), x]));
	const lines = [`${a.length} entities expected, ${b.length} replayed`];

	for (const m of missing) {
		const key = describeEntity(m);
		const counterpart = extraByKey.get(key);
		if (counterpart) {
			extraByKey.delete(key);
			lines.push(`    ~ ${key} survived replay but was altered:`);
			for (const d of fieldDiff(m, counterpart)) lines.push(`        ${d}`);
		} else {
			lines.push(`    - missing after replay: ${key}`);
		}
	}
	for (const key of extraByKey.keys()) lines.push(`    + unexpected after replay: ${key}`);

	return lines.slice(0, 24).join('\n');
};

// ---------------------------------------------------------------- graph

const readNodes = (out: string): Node[] => {
	if (!existsSync(out)) fail(`no such folder: ${out}`);

	const nodes: Node[] = [];
	for (const folder of readdirSync(out).sort()) {
		const path = join(out, folder, 'snapshot.json');
		if (!existsSync(path)) continue;

		let raw: PostgresSnapshot;
		try {
			raw = JSON.parse(readFileSync(path, 'utf8')) as PostgresSnapshot;
		} catch {
			return fail(`${path} is not valid JSON`);
		}
		if ((raw as unknown as { type?: string }).type) {
			fail(`${path} already has a \`type\` field — this folder looks converted already`);
		}
		if (!Array.isArray(raw.ddl)) fail(`${path} has no \`ddl\` array`);
		nodes.push({ id: raw.id, prevIds: raw.prevIds ?? [], path, folder, raw });
	}
	if (nodes.length === 0) fail(`no snapshots found under ${out}`);
	return nodes;
};

/**
 * Kahn's algorithm over `prevIds`. Folder names sort lexicographically by
 * timestamp, which is NOT topological once branches exist — a merge node can sort
 * ahead of its own parents — so ancestry has to come from `prevIds`.
 */
const topoSort = (nodes: Node[]): Node[] => {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const real = (n: Node) => n.prevIds.filter((p) => p !== ORIGIN && byId.has(p));

	const pending = new Map(nodes.map((n) => [n.id, real(n).length]));
	const children = new Map<string, string[]>();
	for (const n of nodes) for (const p of real(n)) children.set(p, [...(children.get(p) ?? []), n.id]);

	// Sort the ready set by id so the output is stable regardless of read order.
	const ready = nodes.filter((n) => pending.get(n.id) === 0).map((n) => n.id).sort();
	const ordered: Node[] = [];

	while (ready.length) {
		const id = ready.shift()!;
		ordered.push(byId.get(id)!);
		for (const child of children.get(id) ?? []) {
			const left = pending.get(child)! - 1;
			pending.set(child, left);
			if (left === 0) {
				ready.push(child);
				ready.sort();
			}
		}
	}

	if (ordered.length !== nodes.length) {
		const stuck = nodes.filter((n) => !ordered.includes(n)).map((n) => n.folder);
		fail(`prevIds form a cycle, or reference a missing snapshot. Unreachable: ${stuck.join(', ')}`);
	}
	return ordered;
};

// ---------------------------------------------------------------- fork points

const ancestorsOf = (
	byId: Map<string, Node>,
	startId: string,
	cache: Map<string, Set<string>>,
): Set<string> => {
	const hit = cache.get(startId);
	if (hit) return hit;

	// Inclusive of `startId` itself: a parent that is already an ancestor of every
	// other parent IS the fork point, and must stay a candidate.
	const seen = new Set<string>();
	const stack = [startId];
	while (stack.length) {
		const id = stack.pop()!;
		if (seen.has(id)) continue;
		const node = byId.get(id);
		if (!node) continue; // ORIGIN sentinel / snapshot outside this folder
		seen.add(id);
		for (const prev of node.prevIds) stack.push(prev);
	}
	cache.set(startId, seen);
	return seen;
};

/**
 * The fork point of a set of parents: the deepest node that is an ancestor of all
 * of them. Returns null when they share no real ancestor (their only common
 * ancestor is the ORIGIN sentinel).
 */
const forkPoint = (byId: Map<string, Node>, parentIds: string[]): string | null => {
	const cache = new Map<string, Set<string>>();

	let common: Set<string> | null = null;
	for (const id of parentIds) {
		const ancestors = ancestorsOf(byId, id, cache);
		if (common === null) {
			common = new Set(ancestors);
			continue;
		}
		for (const c of common) if (!ancestors.has(c)) common.delete(c);
	}
	if (!common || common.size === 0) return null;

	// Deepest = the candidate whose own ancestor set contains every other common
	// ancestor. Ties break toward the largest ancestor set, deterministically.
	let best: string | null = null;
	let bestSize = -1;
	for (const candidate of common) {
		const reach = ancestorsOf(byId, candidate, cache);
		if (![...common].every((id) => reach.has(id))) continue;
		if (reach.size > bestSize) {
			best = candidate;
			bestSize = reach.size;
		}
	}
	return best;
};

// ---------------------------------------------------------------- diffing

/**
 * `ddlDiff` mutates BOTH of its arguments in place, and entities are only
 * shallow-copied on push, so nested arrays stay shared with the input. Deep-clone
 * before every call — otherwise step N silently corrupts the snapshot that step
 * N+1 diffs against.
 */
const ddlFrom = (entities: unknown[]) => {
	const ddl = createDDL();
	const result = ddl.entities.pushAll(structuredClone(entities) as any);
	// pushAll is atomic: on a duplicate key it stores NOTHING and returns CONFLICT
	// rather than throwing, which would otherwise surface as an empty ddl and a
	// nonsense diff.
	if (result && (result as { status?: string }).status !== 'OK') {
		fail(`could not load ddl entities: ${JSON.stringify(result)}`);
	}
	return ddl;
};

const diffStep = async (
	parent: PostgresSnapshot,
	child: PostgresSnapshot,
): Promise<JsonStatement[]> => {
	// The child's own `renames` are the record of what the author answered at
	// generate time. `ddlDiffDry` passes an empty set instead, which turns every
	// rename into drop+create — fine for conflict footprints, wrong for replay.
	// One migration step means one rename set, so there is no chaining problem.
	//
	// `mockResolver` infers its entity type from the argument position it lands in,
	// so each of the fourteen has to be constructed inline — hoisting one into a
	// `const` collapses the type parameter to its constraint and stops matching the
	// per-entity `Resolver<T>` each slot expects. They share `renames`, which is the
	// only state involved. Same shape as `ddlDiffDry`.
	const renames = new Set(child.renames ?? []);
	const { statements } = await ddlDiff(
		ddlFrom(parent.ddl),
		ddlFrom(child.ddl),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		'default',
	);
	return statements;
};

// ---------------------------------------------------------------- main

const convert = async (
	nodes: Node[],
	ordered: Node[],
	base: Node,
	strategy: MergeStrategy,
	format: Format,
	log: boolean,
): Promise<Map<string, EmittedFile>> => {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const parentsOf = (n: Node) => n.prevIds.filter((p) => p !== ORIGIN && byId.has(p));

	const emit = new Map<string, EmittedFile>();
	const state = (n: Node): StateFile => ({
		type: n.id === base.id ? 'base' : 'checkpoint',
		version: n.raw.version,
		dialect: n.raw.dialect,
		id: n.id,
		prevIds: n.prevIds,
		renames: n.raw.renames ?? [],
		ddl: n.raw.ddl,
	});

	emit.set(base.id, state(base));

	for (const node of ordered) {
		if (node.id === base.id) continue;
		const parents = parentsOf(node);
		if (parents.length === 0) fail(`${node.folder} has no parent in this folder (prevIds: ${node.prevIds.join(', ')})`);

		const isMerge = parents.length > 1;

		if (isMerge && strategy === 'checkpoint') {
			emit.set(node.id, state(node));
			if (log) console.log(`  ● ${node.folder.padEnd(34)} ${'checkpoint'.padStart(15)}  (merge of ${parents.length})`);
			continue;
		}

		// Linear nodes anchor at their parent; merge nodes at their fork point, so
		// the anchor never depends on prevIds order.
		let anchorId = parents[0]!;
		if (isMerge && strategy === 'fork') {
			const fork = forkPoint(byId, parents);
			if (!fork) {
				fail(
					`${node.folder} merges ${parents.length} parents that share no common ancestor.\n`
						+ `  There is no fork point to anchor it at — use --merge=checkpoint for this folder.`,
				);
			}
			anchorId = fork!;
		}

		const parent = byId.get(anchorId)!;

		const payload = format === 'structural'
			? { deltas: delta(ddlFrom(parent.raw.ddl), ddlFrom(node.raw.ddl)) }
			: { statements: await diffStep(parent.raw, node.raw) };
		const count = (payload.deltas ?? payload.statements)!.length;

		// Replaying onto the parent must reproduce this snapshot's ddl exactly, or the
		// conversion is lossy and must not be written.
		const replayed = payload.deltas
			? apply(ddlFrom(parent.raw.ddl), payload.deltas).entities.list()
			: generateLatestSnapshot(parent.raw, payload.statements!).ddl;
		const mismatch = ddlMismatch(node.raw.ddl, replayed);
		if (mismatch) {
			fail(
				`replay does not reproduce ${node.folder}\n`
					+ `    parent: ${parent.folder}\n`
					+ `    ${format}: ${count}\n`
					+ `    ${mismatch}\n\n`
					+ `  Converting would lose information. Nothing was written.`,
			);
		}

		if (log) {
			console.log(
				`  ✓ ${node.folder.padEnd(34)} ${String(count).padStart(4)} ${
					format === 'structural' ? 'deltas    ' : 'statements'
				}`
					+ `  <- ${parent.folder}`
					+ (isMerge ? `  (merge of ${parents.length} @ ${strategy === 'fork' ? 'fork point' : 'first parent'})` : ''),
			);
		}

		emit.set(node.id, {
			type: 'diff',
			version: node.raw.version,
			dialect: node.raw.dialect,
			id: node.id,
			prevIds: node.prevIds,
			basedOn: parent.id,
			renames: node.raw.renames ?? [],
			...payload,
		});
	}

	return emit;
};

/**
 * Reconstructs every snapshot's state from the emitted files ALONE — no access to
 * the originals — which is exactly what `generate` will have to do. Per-step
 * verification plus induction already implies this, but this exercises the real
 * reader algorithm rather than trusting the induction.
 */
const verifyReader = (nodes: Node[], ordered: Node[], emit: Map<string, EmittedFile>): void => {
	const reconstructed = new Map<string, PostgresSnapshot>();

	for (const node of ordered) {
		const file = emit.get(node.id)!;
		let next: PostgresSnapshot;

		if (file.type !== 'diff') {
			next = { ...node.raw, ddl: file.ddl } as PostgresSnapshot;
		} else {
			const parent = reconstructed.get(file.basedOn);
			if (!parent) fail(`reader: ${node.folder} is based on ${file.basedOn}, which has no reconstructed state`);
			next = file.deltas
				? ({ ...parent!, ddl: apply(ddlFrom(parent!.ddl), file.deltas).entities.list() } as PostgresSnapshot)
				: generateLatestSnapshot(parent!, file.statements!);
		}

		reconstructed.set(node.id, next);
	}

	for (const node of nodes) {
		const mismatch = ddlMismatch(node.raw.ddl, reconstructed.get(node.id)!.ddl);
		if (mismatch) {
			fail(`reader cannot reconstruct ${node.folder} from the converted files\n    ${mismatch}`);
		}
	}
};

const main = async () => {
	const args = process.argv.slice(2);
	const out = args.find((a) => a.startsWith('--out='))?.slice('--out='.length);
	const write = args.includes('--write');
	const strategy = (args.find((a) => a.startsWith('--merge='))?.slice('--merge='.length)
		?? 'fork') as MergeStrategy;
	const format = (args.find((a) => a.startsWith('--format='))?.slice('--format='.length)
		?? 'structural') as Format;
	if (!out) {
		fail(
			'usage: tsx scripts/snapshots-to-diffs.ts --out=./drizzle [--write]'
				+ ' [--merge=fork|checkpoint|basedon] [--format=structural|statements]',
		);
	}
	if (!['fork', 'checkpoint', 'basedon'].includes(strategy)) {
		fail(`--merge must be 'fork', 'checkpoint' or 'basedon', got '${strategy}'`);
	}
	if (!['structural', 'statements'].includes(format)) {
		fail(`--format must be 'structural' or 'statements', got '${format}'`);
	}

	const nodes = readNodes(out!);
	const ordered = topoSort(nodes);
	const byId = new Map(nodes.map((n) => [n.id, n]));

	const roots = ordered.filter((n) => n.prevIds.every((p) => p === ORIGIN || !byId.has(p)));
	if (roots.length !== 1) {
		fail(
			`expected exactly one root snapshot, found ${roots.length}`
				+ (roots.length ? `: ${roots.map((r) => r.folder).join(', ')}` : ''),
		);
	}
	const base = roots[0]!;
	const merges = ordered.filter((n) => n.prevIds.filter((p) => p !== ORIGIN && byId.has(p)).length > 1);

	console.log(`\n  ${nodes.length} snapshots in ${out}`);
	console.log(`  base: ${base.folder}`);
	console.log(`  merge nodes: ${merges.length}   strategy: ${strategy}   format: ${format}\n`);

	const emit = await convert(nodes, ordered, base, strategy, format, true);
	verifyReader(nodes, ordered, emit);

	const size = (m: Map<string, EmittedFile>) =>
		nodes.reduce((sum, n) => sum + Buffer.byteLength(JSON.stringify(m.get(n.id), null, 2)), 0);
	const before = nodes.reduce((sum, n) => sum + Buffer.byteLength(readFileSync(n.path)), 0);
	const after = size(emit);
	const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;

	console.log(`\n  replay verified for all ${nodes.length} snapshots`);
	console.log(`  state reconstructed from converted files alone for all ${nodes.length} snapshots`);
	console.log(
		`\n  ${mb(before)} -> ${mb(after)}  (${((1 - after / before) * 100).toFixed(1)}% smaller, ${
			(before / after).toFixed(1)
		}x)`,
	);

	// Price the other strategy too, so the trade-off is a number rather than a guess.
	if (merges.length > 0) {
		for (const other of ['fork', 'checkpoint', 'basedon'] as MergeStrategy[]) {
			if (other === strategy) continue;
			const otherSize = size(await convert(nodes, ordered, base, other, format, false));
			console.log(
				`  for comparison, --merge=${other.padEnd(10)} ${mb(otherSize)} (${(before / otherSize).toFixed(1)}x)`,
			);
		}
	}

	if (!write) {
		console.log(`\n  dry run — pass --write to rewrite in place\n`);
		return;
	}

	for (const node of nodes) writeFileSync(node.path, JSON.stringify(emit.get(node.id), null, 2));
	console.log(`\n  wrote ${nodes.length} snapshots\n`);
};

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)));
