import { existsSync, readFileSync } from 'fs';
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

// What one statement writes, reads and shares, as lists of nodes, with the kind and the target of the statement
// for the report. Two footprints of two branches conflict when one writes a node that the other writes, shares or
// reads, or when one shares a node that the other reads. Two shared writes and two reads do not conflict. A shared
// write is for a fact that several objects guarantee: a drop of a unique constraint and a drop of a unique index
// on the same columns do not conflict, and either of them conflicts with a new foreign key that reads the
// uniqueness of those columns.
// `sqlHash` is set only for a statement whose SQL is idempotent. Two footprints with one
// `sqlHash` are the same change on two branches, and they do not conflict with each other.
// Nodes are opaque strings that the dialect builds; the engine only compares them.
export type Footprint = {
	statementType: string;
	statementTarget: [kind: string, firstNamePart: string, ...restNameParts: string[]];
	writes: string[];
	reads?: string[];
	sharedWrites?: string[];
	sqlHash?: string;
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
		// ORIGIN sentinel ids (and any id without a snapshot) are not real
		// ancestor nodes, so they never qualify as a composition base.
		if (!node) continue;
		result.add(id);
		for (const prev of node.prevIds) stack.push(prev);
	}

	cache.set(startId, result);
	return result;
}

/**
 * Lowest common ancestor of a set of leaves in the snapshot DAG.
 *
 * Returns the deepest node that is an ancestor (inclusive of itself) of every
 * leaf, i.e. the most recent point the open heads still share. Used as the merge
 * base so that segments already collapsed by a merge node below it are not
 * replayed. Returns `null` when the leaves share no real-node ancestor (their
 * only common ancestor is the ORIGIN sentinel), in which case the caller falls
 * back to the dry snapshot.
 *
 * For two leaves, this node is their fork point. `detectBranchConflicts` reports
 * it as the parent of a conflict, and it reports ORIGIN when the result is `null`.
 */
function lowestCommonAncestor(
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

	// The lowest common ancestor is the common ancestor whose own ancestor set
	// contains every other common ancestor (the deepest one). Prefer the
	// candidate reaching the most ancestors to break ties deterministically.
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
	TStatement,
	TSnapshot extends { id: string; prevIds: string[] },
> {
	protected abstract describe(statement: TStatement): { description: string; target: ConflictTarget; action: string };

	public abstract detectNonCommutative(
		snapshots: string[] | ParsedSnapshotInput[],
	): Promise<NonCommutativityReport>;

	protected branchOf(
		chain: MigrationNode[],
		statement: TStatement,
		source?: MigrationNode,
	): UnifiedBranchConflict['branchA'] {
		const { description, target, action } = this.describe(statement);
		return {
			chain,
			statementDescription: source ? `${description} (${basename(source.path)})` : description,
			target,
			action,
			...(source && { source }),
		};
	}

	protected buildSnapshotGraph(
		snapshots: string[] | ParsedSnapshotInput[],
	): Record<string, SnapshotNode<TSnapshot>> {
		const byId: Record<string, SnapshotNode<TSnapshot>> = {};
		for (const input of snapshots) {
			let file: string;
			// The cast to `TSnapshot` is not checked. This function reads only `id` and `prevIds`, and the dialect
			// code that reads `raw` needs the rest of `TSnapshot`.
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

const isSameChange = (a: Footprint, b: Footprint) =>
	a.sqlHash !== undefined && a.statementType === b.statementType && a.sqlHash === b.sqlHash;

// The new commutativity model, for dialects with format 9 snapshots. Each snapshot stores a `Footprint` for each
// statement of its migration, and `check` compares the nodes of the footprints of two branches.
// `ConflictListCommutativity` is the old model.
export abstract class FootprintCommutativity<
	TSnapshot extends { id: string; prevIds: string[] },
> extends AbstractCommutativity<Footprint, TSnapshot> {
	// Returns a footprint of one branch and a footprint of the other branch that conflict, or undefined. A write or
	// a shared write of one branch conflicts with a write or a read of the same node on the other branch, so the
	// search runs in both directions to cover every case in `Footprint`.
	public findConflict(a: Footprint[], b: Footprint[]) {
		const firstConflict = (from: Footprint[], to: Footprint[]) => {
			const touching = new Map<string, Footprint[]>();
			for (const footprint of to) {
				for (const node of [...footprint.writes, ...(footprint.reads ?? [])]) {
					const list = touching.get(node);
					if (list) list.push(footprint);
					else touching.set(node, [footprint]);
				}
			}
			for (const footprint of from) {
				for (const node of [...footprint.writes, ...(footprint.sharedWrites ?? [])]) {
					const others = touching.get(node) ?? [];
					for (let idx = others.length - 1; idx >= 0; idx--) {
						if (!isSameChange(footprint, others[idx])) return { left: footprint, right: others[idx] };
					}
				}
			}
		};
		return firstConflict(a, b) ?? firstConflict(b, a);
	}

	// Finds the conflicts between every pair of leaves. The branch of a leaf is the part of its history that the
	// other leaf does not have. Every footprint of the branch counts, so a change that a later snapshot of the same
	// branch reverts still conflicts.
	protected async detectBranchConflicts(
		nodes: Record<string, SnapshotNode<TSnapshot>>,
		footprintsOfSnapshot: (id: string) => Footprint[],
	): Promise<NonCommutativityReport> {
		const histories = new Map<string, Set<string>>();
		const sources = new Map<Footprint, string>();
		for (const id of Object.keys(nodes)) {
			for (const footprint of footprintsOfSnapshot(id)) sources.set(footprint, id);
		}

		const conflicts: UnifiedBranchConflict[] = [];
		const leafIds = leafIdsOf(nodes);
		for (let i = 0; i < leafIds.length; i++) {
			for (let j = i + 1; j < leafIds.length; j++) {
				const [x, y] = [leafIds[i], leafIds[j]];
				const historyX = ancestorsOf(nodes, x, histories);
				const historyY = ancestorsOf(nodes, y, histories);
				// `branchX` and `branchY` keep the key order of `nodes`, which is folder-name order. A child sorts
				// after its parent, so each branch lists its snapshots in the order that migrate runs them.
				const branchX = Object.keys(nodes).filter((id) => historyX.has(id) && !historyY.has(id));
				const branchY = Object.keys(nodes).filter((id) => historyY.has(id) && !historyX.has(id));

				const found = this.findConflict(
					branchX.flatMap((id) => footprintsOfSnapshot(id)),
					branchY.flatMap((id) => footprintsOfSnapshot(id)),
				);
				if (!found) continue;

				// `found.left` can come from either branch. Its snapshot in `sources` tells which one.
				const [footprintX, footprintY] = historyX.has(sources.get(found.left)!)
					? [found.left, found.right]
					: [found.right, found.left];
				const describeLeafBranch = (branch: string[], footprint: Footprint) => {
					const sourceId = sources.get(footprint)!;
					return this.branchOf(
						branch.map((id) => ({ id, path: nodes[id].folderPath })),
						footprint,
						{ id: sourceId, path: nodes[sourceId].folderPath },
					);
				};
				const forkId = lowestCommonAncestor(nodes, [x, y]);
				conflicts.push({
					parentId: forkId ?? originUUID,
					parentPath: forkId ? nodes[forkId].folderPath : undefined,
					branchA: describeLeafBranch(branchX, footprintX),
					branchB: describeLeafBranch(branchY, footprintY),
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

// The old commutativity model, for dialects whose snapshots store a full state. `check` diffs two snapshots to
// get the statements, and each statement kind lists the statement kinds that it conflicts with. A dialect moves
// to `FootprintCommutativity` when it gets format 9 snapshots.
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

	protected abstract formatFootprintTarget(
		action: TStatement['type'],
		target: TTarget,
	): string;

	protected abstract describeStatement(
		statement: TStatement,
		info: CommutativityStatementInfo<TStatement, TTarget>,
	): string;

	protected abstract describeStatementTarget(
		statement: TStatement,
		info: CommutativityStatementInfo<TStatement, TTarget>,
	): ConflictTarget;

	protected getImplicitAncestors(_target: TTarget): TTarget[] {
		return [];
	}

	protected abstract getDrySnapshot(): TSnapshot;

	protected abstract diffSnapshots(
		fromSnapshot: TSnapshot,
		toSnapshot: TSnapshot,
	): Promise<{ statements: TStatement[] }>;

	protected resolveStatement(statement: TStatement): {
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

	protected override describe(statement: TStatement) {
		const { info } = this.resolveStatement(statement);
		return {
			description: this.describeStatement(statement, info),
			target: this.describeStatementTarget(statement, info),
			action: statement.type,
		};
	}

	public footprint(statement: TStatement): [string[], string[]] {
		const { info, conflicts } = this.resolveStatement(statement);

		const statementFootprints = this.statementTargets(info).map((target) =>
			this.formatFootprintTarget(statement.type, target)
		);

		const conflictFootprints = conflicts.map((conflictType) => this.formatFootprintTarget(conflictType, info.primary));

		return [statementFootprints, conflictFootprints];
	}

	// Finds the conflicts for a dialect whose snapshots store the full state. It diffs every fork parent against
	// the leaves under each of its children, so it sees only the net effect of a branch.
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
		const commutativeBranches: NonCommutativityReport['commutativeBranches'] = [];

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

		const leafNodes: string[] = [];
		for (const id of Object.keys(nodes)) {
			if (!prevToChildren[id]) leafNodes.push(id);
		}

		// Open commutative merge. When the whole history is conflict-free and more
		// than one head is open, every pair of open heads is commutative (the loop
		// above compares every cross-branch leaf pair), so all of them can be merged
		// at once. The merge base is the lowest common ancestor of the open heads —
		// not a higher fork — so segments already collapsed by a merge node below it
		// are never replayed. Each head contributes diff(LCA -> head); statements
		// inherited from a nested fork below the LCA show up in more than one head's
		// diff and are de-duplicated by the consumer before they are replayed.
		if (conflicts.length === 0 && leafNodes.length > 1) {
			const lcaId = lowestCommonAncestor(nodes, leafNodes);
			const baseNode = lcaId ? nodes[lcaId] : undefined;
			const baseSnapshot = baseNode ? baseNode.raw : drySnapshot;

			// Sort heads by id so the composed migration and leaf ids are
			// deterministic regardless of file read order.
			const sortedLeafIds = [...leafNodes].sort((a, b) => a.localeCompare(b));
			const leafs = await Promise.all(
				sortedLeafIds.map(async (leafId) => {
					const leafNode = nodes[leafId]!;
					const { statements } = await diffOnce(baseSnapshot, leafNode.raw);
					return {
						id: leafId,
						path: leafNode.folderPath,
						statements,
					};
				}),
			);

			commutativeBranches.push({
				parentId: lcaId ?? drySnapshot.id,
				parentPath: baseNode?.folderPath,
				parentSnapshot: baseSnapshot,
				statements: composeMergeStatements(leafs.map((leaf) => leaf.statements)),
				leafs,
			});
		}

		return { conflicts, leafNodes, commutativeBranches };
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

	private statementTargets(
		info: CommutativityStatementInfo<TStatement, TTarget>,
	): TTarget[] {
		return [info.primary, ...info.ancestors, ...this.getImplicitAncestors(info.primary)];
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

	private findFootprintIntersections(
		branchAHashes: Array<{ hash: string; statement: TStatement }>,
		branchAConflicts: Array<{ hash: string; statement: TStatement }>,
		branchBHashes: Array<{ hash: string; statement: TStatement }>,
		branchBConflicts: Array<{ hash: string; statement: TStatement }>,
	) {
		const branchAConflictByHash = new Map<string, TStatement>();
		for (const c of branchAConflicts) branchAConflictByHash.set(c.hash, c.statement);

		const branchBConflictByHash = new Map<string, TStatement>();
		for (const c of branchBConflicts) branchBConflictByHash.set(c.hash, c.statement);

		for (const a of branchAHashes) {
			const match = branchBConflictByHash.get(a.hash);
			if (match) {
				return { leftStatement: a.statement, rightStatement: match };
			}
		}

		for (const b of branchBHashes) {
			const match = branchAConflictByHash.get(b.hash);
			if (match) {
				return { leftStatement: b.statement, rightStatement: match };
			}
		}
	}

	private generateLeafFootprints(statements: TStatement[]): LeafFootprints<TStatement> {
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
