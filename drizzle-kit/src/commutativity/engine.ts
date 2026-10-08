import { existsSync, readFileSync } from 'fs';
import { isDeepStrictEqual } from 'node:util';
import { basename, dirname } from 'path';
import { originUUID } from '../utils';
import type { ConflictTarget, MigrationNode, NonCommutativityReport, UnifiedBranchConflict } from './types';

type SnapshotNode<TSnapshot extends { id: string; prevIds: string[] }> = {
	id: string;
	prevIds: string[];
	path: string;
	folderPath: string;
	raw: TSnapshot;
};
export type SnapshotHeader = {
	id: string;
	prevIds: string[];
};

export type ParsedSnapshotInput<TSnapshot extends SnapshotHeader = SnapshotHeader> = {
	path: string;
	snapshot: TSnapshot;
};

/**
 * Facet model. Each statement declares the nodes it touches in a hierarchical
 * namespace:
 *  - `owns`     exclusive structural locks — the exact node(s) it creates,
 *               renames, alters, or drops. Two statements that own the same
 *               node conflict.
 *  - `destroys` existence writes — a drop removes a node, which conflicts with
 *               anything that `needs` it (children and cross-references).
 *  - `needs`    shared existence reads — ancestor nodes (table, schema) and
 *               cross-referenced nodes that must still exist. Reads never
 *               conflict with reads, so two branches both needing the same
 *               table is fine.
 *  - `provides` nodes that the statement adds or removes for other statements
 *               to need, such as the unique key that a primary key gives to
 *               foreign keys. It conflicts with a statement that needs the
 *               node, and not with another statement that provides it.
 *
 * Keys are opaque strings minted by the dialect; the engine only compares them.
 */
export type FacetPaths = {
	owns: string[];
	destroys?: string[];
	needs?: string[];
	provides?: string[];
};

type LeafFootprints<TStatement> = {
	statementHashes: Array<{ hash: string; statement: TStatement }>;
	conflictFootprints: Array<{ hash: string; statement: TStatement }>;
};

function buildPrevToChildren<TNode extends { id: string; prevIds: string[] }>(
	nodes: Record<string, TNode>,
): Record<string, string[]> {
	const prevToChildren: Record<string, string[]> = {};
	for (const node of Object.values(nodes)) {
		for (const parentId of node.prevIds) {
			(prevToChildren[parentId] ??= []).push(node.id);
		}
	}
	return prevToChildren;
}

function leafIdsOf(nodes: Record<string, { prevIds: string[] }>): string[] {
	const parents = new Set(Object.values(nodes).flatMap((it) => it.prevIds));
	return Object.keys(nodes).filter((id) => !parents.has(id));
}

function collectLeaves(
	prevToChildren: Record<string, string[]>,
	startId: string,
): string[] {
	const leaves: string[] = [];
	const visited = new Set<string>();
	const stack: string[] = [startId];

	while (stack.length) {
		const id = stack.pop()!;
		if (visited.has(id)) continue;
		visited.add(id);

		const children = prevToChildren[id];
		if (!children || children.length === 0) {
			leaves.push(id);
			continue;
		}
		for (const child of children) {
			if (!visited.has(child)) stack.push(child);
		}
	}

	return leaves;
}

function ancestorsOf(
	nodes: Record<string, { prevIds: string[] }>,
	startId: string,
	cache: Map<string, Set<string>>,
): Set<string> {
	const cached = cache.get(startId);
	if (cached) return cached;

	const result = new Set<string>();
	const stack: string[] = [startId];
	while (stack.length) {
		const id = stack.pop()!;
		if (result.has(id)) continue;
		const node = nodes[id];
		// ORIGIN and any other id without a snapshot are not part of a history.
		if (!node) continue;
		result.add(id);
		for (const prev of node.prevIds) stack.push(prev);
	}

	cache.set(startId, result);
	return result;
}

// The fork point of the given leaves. Returns null when the only common ancestor is ORIGIN.
function forkPointOf(
	nodes: Record<string, { prevIds: string[] }>,
	leafIds: string[],
): string | null {
	const cache = new Map<string, Set<string>>();

	let common: Set<string> | null = null;
	for (const leafId of leafIds) {
		const ancestors = ancestorsOf(nodes, leafId, cache);
		if (common === null) {
			common = new Set(ancestors);
			continue;
		}
		for (const id of common) {
			if (!ancestors.has(id)) common.delete(id);
		}
		if (common.size === 0) return null;
	}
	if (!common || common.size === 0) return null;

	// The fork point is the common ancestor whose own history contains every other common ancestor.
	// If several candidates match, the one with the largest history wins, so the result is stable.
	let best: string | null = null;
	let bestSize = -1;
	for (const candidate of common) {
		const candidateAncestors = ancestorsOf(nodes, candidate, cache);
		const containsAllCommon = [...common].every((id) => candidateAncestors.has(id));
		if (containsAllCommon && candidateAncestors.size > bestSize) {
			best = candidate;
			bestSize = candidateAncestors.size;
		}
	}
	if (best !== null) return best;

	// Diamond history with no single deepest common ancestor: fall back to the
	// common ancestor closest to the leaves (largest ancestor set).
	for (const candidate of common) {
		const size = ancestorsOf(nodes, candidate, cache).size;
		if (size > bestSize) {
			best = candidate;
			bestSize = size;
		}
	}
	return best;
}

function composeMergeStatements<TStatement>(
	leafStatements: TStatement[][],
): TStatement[] {
	const seen = new Set<string>();
	const composed: TStatement[] = [];
	for (const statements of leafStatements) {
		for (const statement of statements) {
			const key = JSON.stringify(statement);
			if (seen.has(key)) continue;
			seen.add(key);
			composed.push(statement);
		}
	}
	return composed;
}

export abstract class AbstractCommutativity<
	TStatement extends { type: string },
	TSnapshot extends { id: string; prevIds: string[] },
> {
	protected abstract describe(statement: TStatement): { description: string; target: ConflictTarget };

	public abstract detectNonCommutative(
		snapshots: string[] | ParsedSnapshotInput[],
	): Promise<NonCommutativityReport>;

	protected abstract generateLeafFootprints(statements: TStatement[]): LeafFootprints<TStatement>;

	// True when the SQL of the statement gives the same result if it runs a second time.
	protected isRepeatable(_statement: TStatement): boolean {
		return false;
	}

	// A claim says which object a statement changes, and not what it changes the object to. Two equal
	// statements on two branches are one change when the second run changes nothing.
	private isSameChange(a: TStatement, b: TStatement): boolean {
		return a.type === b.type && this.isRepeatable(a) && isDeepStrictEqual(a, b);
	}

	public async getReasonsFromStatements(aStatements: TStatement[], bStatements: TStatement[]) {
		const branchAFootprints = this.generateLeafFootprints(aStatements);
		const branchBFootprints = this.generateLeafFootprints(bStatements);

		return this.findFootprintIntersections(
			branchAFootprints.statementHashes,
			branchAFootprints.conflictFootprints,
			branchBFootprints.statementHashes,
			branchBFootprints.conflictFootprints,
		);
	}

	protected branchOf(
		chain: MigrationNode[],
		statement: TStatement,
		source?: MigrationNode,
	): UnifiedBranchConflict['branchA'] {
		const { description, target } = this.describe(statement);
		return {
			chain,
			statementDescription: source ? `${description} (${basename(source.path)})` : description,
			target,
			action: statement.type,
			...(source && { source }),
		};
	}

	private findFootprintIntersections(
		branchAHashes: Array<{ hash: string; statement: TStatement }>,
		branchAConflicts: Array<{ hash: string; statement: TStatement }>,
		branchBHashes: Array<{ hash: string; statement: TStatement }>,
		branchBConflicts: Array<{ hash: string; statement: TStatement }>,
	) {
		const byHash = (conflicts: Array<{ hash: string; statement: TStatement }>) => {
			const map = new Map<string, TStatement[]>();
			for (const { hash, statement } of conflicts) {
				const list = map.get(hash);
				if (list) list.push(statement);
				else map.set(hash, [statement]);
			}
			return map;
		};
		// Of the statements of the other branch with one hash, the last one is reported.
		const firstConflict = (
			hashes: Array<{ hash: string; statement: TStatement }>,
			conflicts: Map<string, TStatement[]>,
		) => {
			for (const { hash, statement } of hashes) {
				const others = conflicts.get(hash) ?? [];
				for (let idx = others.length - 1; idx >= 0; idx--) {
					if (!this.isSameChange(statement, others[idx])) {
						return { leftStatement: statement, rightStatement: others[idx] };
					}
				}
			}
		};

		return firstConflict(branchAHashes, byHash(branchBConflicts))
			?? firstConflict(branchBHashes, byHash(branchAConflicts));
	}

	protected buildSnapshotGraph(
		snapshots: string[] | ParsedSnapshotInput[],
	): Record<string, SnapshotNode<TSnapshot>> {
		const byId: Record<string, SnapshotNode<TSnapshot>> = {};
		for (const input of snapshots) {
			let file: string;
			// Only `id` and `prevIds` are read here. The dialect code that reads `raw` depends on the rest of `TSnapshot`.
			let raw: TSnapshot;
			if (typeof input === 'string') {
				file = input;
				if (!existsSync(file)) continue;
				raw = JSON.parse(readFileSync(file, 'utf8')) as TSnapshot;
			} else {
				file = input.path;
				raw = input.snapshot as TSnapshot;
			}
			byId[raw.id] = {
				id: raw.id,
				prevIds: raw.prevIds,
				path: file,
				folderPath: dirname(file),
				raw,
			};
		}

		return byId;
	}
}

export abstract class FacetCommutativity<
	TStatement extends { type: string },
	TSnapshot extends { id: string; prevIds: string[] },
> extends AbstractCommutativity<TStatement, TSnapshot> {
	public abstract buildFacetPaths(statement: TStatement): FacetPaths;

	/**
	 * Facet-model footprints. Encodes a read/write lock per node so that
	 * `findFootprintIntersections` (which matches produced-hashes of one branch
	 * against conflict-hashes of the other) yields:
	 *   write vs write  -> conflict   (two statements own the same node)
	 *   write vs read   -> conflict   (a drop destroys something another needs)
	 *   read  vs read   -> no conflict (both merely need the node to exist)
	 * A write contributes `key#w` to both lists; a read contributes `key#r` to
	 * the produced list and `key#w` to the conflict list, so reads only ever
	 * match against writes. A provided node contributes `key#w` to the produced
	 * list only, so it matches a read and never another write.
	 */
	protected override generateLeafFootprints(statements: TStatement[]): LeafFootprints<TStatement> {
		const statementHashes: Array<{ hash: string; statement: TStatement }> = [];
		const conflictFootprints: Array<{ hash: string; statement: TStatement }> = [];

		for (const statement of statements) {
			const { owns, destroys = [], needs = [], provides = [] } = this.buildFacetPaths(statement);

			for (const key of [...owns, ...destroys]) {
				statementHashes.push({ hash: `${key}#w`, statement });
				conflictFootprints.push({ hash: `${key}#w`, statement });
			}
			for (const key of needs) {
				statementHashes.push({ hash: `${key}#r`, statement });
				conflictFootprints.push({ hash: `${key}#w`, statement });
			}
			for (const key of provides) {
				statementHashes.push({ hash: `${key}#w`, statement });
			}
		}

		return { statementHashes, conflictFootprints };
	}

	// Compares every pair of leaves. A leaf's branch is the part of its history that is missing from the
	// other leaf's history, and every statement of one branch is compared with every statement of the
	// other, so a change that a later snapshot of the same branch reverts still counts.
	protected async detectBranchConflicts(
		nodes: Record<string, SnapshotNode<TSnapshot>>,
		statementsOf: (id: string) => TStatement[],
	): Promise<NonCommutativityReport> {
		const histories = new Map<string, Set<string>>();
		const sources = new Map<TStatement, string>();
		for (const id of Object.keys(nodes)) {
			for (const statement of statementsOf(id)) sources.set(statement, id);
		}

		const conflicts: UnifiedBranchConflict[] = [];
		const leafIds = leafIdsOf(nodes);
		for (let i = 0; i < leafIds.length; i++) {
			for (let j = i + 1; j < leafIds.length; j++) {
				const [x, y] = [leafIds[i], leafIds[j]];
				const historyX = ancestorsOf(nodes, x, histories);
				const historyY = ancestorsOf(nodes, y, histories);
				// `nodes` is in folder-name order, and every child sorts after its parent, so each branch lists a
				// snapshot after its parents, as migrate runs them.
				const branchX = Object.keys(nodes).filter((id) => historyX.has(id) && !historyY.has(id));
				const branchY = Object.keys(nodes).filter((id) => historyY.has(id) && !historyX.has(id));

				const found = await this.getReasonsFromStatements(
					branchX.flatMap((id) => statementsOf(id)),
					branchY.flatMap((id) => statementsOf(id)),
				);
				if (!found) continue;

				// getReasonsFromStatements can return the statement of either branch as leftStatement.
				const [statementX, statementY] = historyX.has(sources.get(found.leftStatement)!)
					? [found.leftStatement, found.rightStatement]
					: [found.rightStatement, found.leftStatement];
				const describeLeafBranch = (branch: string[], leafId: string, statement: TStatement) => {
					const sourceId = sources.get(statement)!;
					return this.branchOf(
						[...branch.filter((id) => id !== leafId), leafId].map((id) => ({ id, path: nodes[id].folderPath })),
						statement,
						{ id: sourceId, path: nodes[sourceId].folderPath },
					);
				};
				const forkId = forkPointOf(nodes, [x, y]);
				conflicts.push({
					parentId: forkId ?? originUUID,
					parentPath: forkId ? nodes[forkId].folderPath : undefined,
					branchA: describeLeafBranch(branchX, x, statementX),
					branchB: describeLeafBranch(branchY, y, statementY),
				});
			}
		}
		return { conflicts, leafNodes: leafIds };
	}
}

export type CommutativityStatementInfo<
	TStatement extends { type: string },
	TTarget,
> = {
	action: TStatement['type'];
	primary: TTarget;
	ancestors: TTarget[];
};

export type CommutativityStatementTargets<TTarget> = {
	primary: TTarget;
	ancestors?: TTarget[];
};

export type CommutativityStatementDefinition<
	TAllStatements extends { type: string },
	TStatement extends TAllStatements,
	TTarget,
> = {
	conflicts: TAllStatements['type'][];
	buildInfo: (statement: TStatement) => CommutativityStatementTargets<TTarget>;
};

export type CommutativityStatementDefinitions<
	TStatement extends { type: string },
	TTarget,
> = {
	[TType in TStatement['type']]: CommutativityStatementDefinition<
		TStatement,
		Extract<TStatement, { type: TType }>,
		TTarget
	>;
};

export abstract class ConflictListCommutativity<
	TStatement extends { type: string },
	TSnapshot extends { id: string; prevIds: string[] },
	TTarget,
> extends AbstractCommutativity<TStatement, TSnapshot> {
	private statementDefinitionsCache?: CommutativityStatementDefinitions<
		TStatement,
		TTarget
	>;

	protected abstract getStatementDefinitions(): CommutativityStatementDefinitions<
		TStatement,
		TTarget
	>;

	protected abstract getDrySnapshot(): TSnapshot;

	protected abstract describeStatement(
		statement: TStatement,
		info: CommutativityStatementInfo<TStatement, TTarget>,
	): string;

	protected abstract describeStatementTarget(
		statement: TStatement,
		info: CommutativityStatementInfo<TStatement, TTarget>,
	): ConflictTarget;

	protected abstract diffSnapshots(
		fromSnapshot: TSnapshot,
		toSnapshot: TSnapshot,
	): Promise<{ statements: TStatement[] }>;

	protected abstract formatFootprintTarget(
		action: TStatement['type'],
		target: TTarget,
	): string;

	protected getImplicitAncestors(_target: TTarget): TTarget[] {
		return [];
	}

	protected override describe(statement: TStatement) {
		const { info } = this.resolveStatement(statement);
		return {
			description: this.describeStatement(statement, info),
			target: this.describeStatementTarget(statement, info),
		};
	}

	private resolveStatement(statement: TStatement): {
		conflicts: TStatement['type'][];
		info: CommutativityStatementInfo<TStatement, TTarget>;
	} {
		const definition = this.getSpecificStatementDefinition(statement);
		const built = definition.buildInfo(statement);

		return {
			conflicts: definition.conflicts,
			info: {
				action: statement.type,
				primary: built.primary,
				ancestors: built.ancestors ?? [],
			},
		};
	}

	private getDefinitions() {
		this.statementDefinitionsCache ??= this.getStatementDefinitions();
		return this.statementDefinitionsCache;
	}

	private getSpecificStatementDefinition<TSpecificStatement extends TStatement>(
		statement: TSpecificStatement,
	): CommutativityStatementDefinition<TStatement, TSpecificStatement, TTarget> {
		return this.getDefinitions()[
			statement.type as TStatement['type']
		] as unknown as CommutativityStatementDefinition<
			TStatement,
			TSpecificStatement,
			TTarget
		>;
	}

	public footprint(statement: TStatement): [string[], string[]] {
		const { info, conflicts } = this.resolveStatement(statement);

		const statementFootprints = this.statementTargets(info).map((target) =>
			this.formatFootprintTarget(statement.type, target)
		);

		const conflictFootprints = conflicts.map((conflictType) => this.formatFootprintTarget(conflictType, info.primary));

		return [statementFootprints, conflictFootprints];
	}

	private statementTargets(
		info: CommutativityStatementInfo<TStatement, TTarget>,
	): TTarget[] {
		return [info.primary, ...info.ancestors, ...this.getImplicitAncestors(info.primary)];
	}

	protected override generateLeafFootprints(statements: TStatement[]): LeafFootprints<TStatement> {
		const statementHashes: Array<{ hash: string; statement: TStatement }> = [];
		const conflictFootprints: Array<{ hash: string; statement: TStatement }> = [];

		for (const statement of statements) {
			const [hashes, conflicts] = this.footprint(statement);

			for (const hash of hashes) {
				statementHashes.push({ hash, statement });
			}

			for (const conflict of conflicts) {
				conflictFootprints.push({ hash: conflict, statement });
			}
		}

		return { statementHashes, conflictFootprints };
	}

	// Compares full-state diffs from every fork parent to the leaves under each of its children, so it
	// sees only the net effect of a branch.
	public override async detectNonCommutative(
		snapshots: string[] | ParsedSnapshotInput[],
	): Promise<NonCommutativityReport> {
		const nodes = this.buildSnapshotGraph(snapshots);
		const prevToChildren = buildPrevToChildren(nodes);

		const diffCache = new Map<string, Promise<{ statements: TStatement[] }>>();
		const drySnapshot = this.getDrySnapshot();
		const drySnapshotId = '__dry__';

		const diffOnce = (from: TSnapshot, to: TSnapshot) => {
			const fromId = from === drySnapshot ? drySnapshotId : from.id;
			const key = `${fromId}::${to.id}`;
			const cached = diffCache.get(key);
			if (cached) return cached;
			const pending = this.diffSnapshots(from, to);
			diffCache.set(key, pending);
			return pending;
		};

		const conflicts: UnifiedBranchConflict[] = [];

		for (const [prevId, childIds] of Object.entries(prevToChildren)) {
			if (childIds.length <= 1) continue;

			const parentNode = nodes[prevId];
			const parentSnapshot = parentNode ? parentNode.raw : drySnapshot;
			const childToLeaves: Record<string, string[]> = {};

			for (const childId of childIds) {
				childToLeaves[childId] = collectLeaves(prevToChildren, childId);
			}

			const leafStatementsCache: Record<
				string,
				Promise<{ statements: TStatement[]; path: string }>
			> = {};

			const resolveLeaf = (leafId: string) => {
				const cached = leafStatementsCache[leafId];
				if (cached) return cached;
				const leafNode = nodes[leafId]!;
				const pending = diffOnce(parentSnapshot, leafNode.raw).then((d) => ({
					statements: d.statements,
					path: leafNode.folderPath,
				}));
				leafStatementsCache[leafId] = pending;
				return pending;
			};

			for (let i = 0; i < childIds.length; i++) {
				for (let j = i + 1; j < childIds.length; j++) {
					const groupA = childToLeaves[childIds[i]] ?? [];
					const groupB = childToLeaves[childIds[j]] ?? [];
					const groupASet = new Set(groupA);
					const hasMergedOverlap = groupB.some((leafId) => groupASet.has(leafId));
					if (hasMergedOverlap) continue;

					for (const aId of groupA) {
						for (const bId of groupB) {
							if (aId === bId) continue;

							const [{ statements: aStatements }, { statements: bStatements }] = await Promise.all([
								resolveLeaf(aId),
								resolveLeaf(bId),
							]);

							const intersected = await this.getReasonsFromStatements(aStatements, bStatements);

							if (!intersected) continue;

							const chainA = this.buildChain(
								nodes,
								prevToChildren,
								childIds[i],
								aId,
							);
							const chainB = this.buildChain(
								nodes,
								prevToChildren,
								childIds[j],
								bId,
							);

							conflicts.push({
								parentId: prevId,
								parentPath: parentNode?.folderPath,
								branchA: this.branchOf(chainA, intersected.leftStatement),
								branchB: this.branchOf(chainB, intersected.rightStatement),
							});
						}
					}
				}
			}
		}

		return this.buildReport(nodes, conflicts, diffOnce);
	}

	// When no pair of leaves conflicts, generate merges all of them at once, starting from the fork point
	// of all leaves, so the changes that a merge before the fork point already joined do not run twice.
	// Each leaf adds diff(fork point -> leaf). A statement that several leaves get from a nested fork
	// after the fork point appears in several of these diffs, and the merge keeps it once.
	private async buildReport(
		nodes: Record<string, SnapshotNode<TSnapshot>>,
		conflicts: UnifiedBranchConflict[],
		diff: (from: TSnapshot, to: TSnapshot) => Promise<{ statements: TStatement[] }>,
	): Promise<NonCommutativityReport> {
		const leafNodes = leafIdsOf(nodes);
		if (conflicts.length > 0 || leafNodes.length < 2) return { conflicts, leafNodes, commutativeBranches: [] };

		const forkId = forkPointOf(nodes, leafNodes);
		const forkNode = forkId ? nodes[forkId] : undefined;
		const forkSnapshot = forkNode ? forkNode.raw : this.getDrySnapshot();

		// The leaves are sorted by id, so the merge does not depend on the order of the files.
		const sortedLeafIds = [...leafNodes].sort((a, b) => a.localeCompare(b));
		const leafs = await Promise.all(
			sortedLeafIds.map(async (leafId) => {
				const leafNode = nodes[leafId]!;
				const { statements } = await diff(forkSnapshot, leafNode.raw);
				return {
					id: leafId,
					path: leafNode.folderPath,
					statements,
				};
			}),
		);

		return {
			conflicts,
			leafNodes,
			commutativeBranches: [{
				parentId: forkId ?? this.getDrySnapshot().id,
				parentPath: forkNode?.folderPath,
				parentSnapshot: forkSnapshot,
				statements: composeMergeStatements(leafs.map((leaf) => leaf.statements)),
				leafs,
			}],
		};
	}

	private buildChain(
		graph: Record<string, SnapshotNode<TSnapshot>>,
		prevToChildren: Record<string, string[]>,
		startId: string,
		targetId: string,
	): { id: string; path: string }[] {
		const queue: string[][] = [[startId]];
		const visited = new Set<string>();

		while (queue.length > 0) {
			const path = queue.shift()!;
			const current = path[path.length - 1];

			if (current === targetId) {
				return path.map((id) => ({
					id,
					path: graph[id]?.folderPath ?? id,
				}));
			}

			if (visited.has(current)) continue;
			visited.add(current);

			const children = prevToChildren[current] ?? [];
			for (const child of children) {
				if (!visited.has(child)) {
					queue.push([...path, child]);
				}
			}
		}

		const leafNode = graph[targetId];
		return [{ id: targetId, path: leafNode?.folderPath ?? targetId }];
	}
}
