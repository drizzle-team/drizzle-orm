import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import type { ConflictTarget, NonCommutativityReport, UnifiedBranchConflict } from './types';

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

/**
 * Common ancestors of two leaves that are not themselves ancestors of another
 * common ancestor — the DAG frontier both heads still share. A fan-in has two
 * (or more) such nodes; a regular fork has one.
 */
function maximalCommonAncestors(
	nodes: Record<string, { prevIds: string[] }>,
	leafA: string,
	leafB: string,
): string[] {
	const cache = new Map<string, Set<string>>();
	const ancestorsA = ancestorsOf(nodes, leafA, cache);
	const ancestorsB = ancestorsOf(nodes, leafB, cache);
	const common: string[] = [];
	for (const id of ancestorsA) {
		if (!ancestorsB.has(id)) continue;
		if (id === leafA || id === leafB) continue;
		common.push(id);
	}
	return common.filter((id) => {
		for (const other of common) {
			if (other === id) continue;
			if (ancestorsOf(nodes, other, cache).has(id)) return false;
		}
		return true;
	});
}

function firstChildFromParent(
	nodes: Record<string, { prevIds: string[] }>,
	parentId: string | null,
	leafId: string,
): string {
	if (!parentId) return leafId;
	let current = leafId;
	const seen = new Set<string>();
	while (nodes[current] && !seen.has(current)) {
		seen.add(current);
		if (nodes[current].prevIds.includes(parentId)) return current;
		const next = nodes[current].prevIds.find((id) => nodes[id]);
		if (!next) break;
		current = next;
	}
	return leafId;
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

export abstract class AbstractCommutativity<
	TStatement extends { type: string },
	TSnapshot extends { id: string; prevIds: string[] },
	TTarget,
> {
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

	public footprint(
		statement: TStatement,
		_snapshot?: TSnapshot,
	): [string[], string[]] {
		const { info, conflicts } = this.resolveStatement(statement);

		const statementFootprints = this.statementTargets(info).map((target) =>
			this.formatFootprintTarget(statement.type, target)
		);

		const conflictFootprints = conflicts.map((conflictType) => this.formatFootprintTarget(conflictType, info.primary));

		return [statementFootprints, conflictFootprints];
	}

	public async getReasonsFromStatements(
		aStatements: TStatement[],
		bStatements: TStatement[],
		parentSnapshot?: TSnapshot,
	) {
		const snapshot = parentSnapshot ?? this.getDrySnapshot();
		const branchAFootprints = this.generateLeafFootprints(aStatements, snapshot);
		const branchBFootprints = this.generateLeafFootprints(bStatements, snapshot);

		return this.findFootprintIntersections(
			branchAFootprints.statementHashes,
			branchAFootprints.conflictFootprints,
			branchBFootprints.statementHashes,
			branchBFootprints.conflictFootprints,
		);
	}

	public async detectNonCommutative(
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

		const leafNodes: string[] = [];
		for (const id of Object.keys(nodes)) {
			if (!prevToChildren[id]) leafNodes.push(id);
		}

		const conflicts: UnifiedBranchConflict[] = [];
		const commutativeBranches: NonCommutativityReport['commutativeBranches'] = [];
		const sortedLeafIds = [...leafNodes].sort((a, b) => a.localeCompare(b));

		// Compare live leaf pairs against the composed frontier they share, not
		// against each historical fork parent. A fan-in parent is missing its
		// siblings' DDL, so diff(forkParent → leaf) treats inherited work as
		// that leaf's own and reports false collisions.
		for (let i = 0; i < sortedLeafIds.length; i++) {
			for (let j = i + 1; j < sortedLeafIds.length; j++) {
				const aId = sortedLeafIds[i]!;
				const bId = sortedLeafIds[j]!;
				const mca = maximalCommonAncestors(nodes, aId, bId);
				const belowId = mca.length <= 1
					? (mca[0] ?? null)
					: lowestCommonAncestor(nodes, mca);
				const belowNode = belowId ? nodes[belowId] : undefined;
				const belowSnapshot = belowNode ? belowNode.raw : drySnapshot;

				const inheritedKeys = new Set<string>();
				if (mca.length > 1) {
					const inherited = composeMergeStatements(
						await Promise.all(
							mca.map(async (id) => (await diffOnce(belowSnapshot, nodes[id]!.raw)).statements),
						),
					);
					for (const statement of inherited) {
						inheritedKeys.add(JSON.stringify(statement));
					}
				}

				const [{ statements: aAll }, { statements: bAll }] = await Promise.all([
					diffOnce(belowSnapshot, nodes[aId]!.raw),
					diffOnce(belowSnapshot, nodes[bId]!.raw),
				]);
				const aStatements = inheritedKeys.size
					? aAll.filter((statement) => !inheritedKeys.has(JSON.stringify(statement)))
					: aAll;
				const bStatements = inheritedKeys.size
					? bAll.filter((statement) => !inheritedKeys.has(JSON.stringify(statement)))
					: bAll;

				const intersected = await this.getReasonsFromStatements(
					aStatements,
					bStatements,
					belowSnapshot,
				);
				if (!intersected) continue;

				const parentId = mca.length === 1 ? mca[0]! : (belowId ?? drySnapshot.id);
				const parentNode = nodes[parentId];
				const leftInfo = this.resolveStatement(intersected.leftStatement).info;
				const rightInfo = this.resolveStatement(intersected.rightStatement).info;

				conflicts.push({
					parentId,
					parentPath: parentNode?.folderPath,
					branchA: {
						chain: this.buildChain(
							nodes,
							prevToChildren,
							firstChildFromParent(nodes, parentId, aId),
							aId,
						),
						statementDescription: this.describeStatement(
							intersected.leftStatement,
							leftInfo,
						),
						target: this.describeStatementTarget(
							intersected.leftStatement,
							leftInfo,
						),
						action: leftInfo.action,
					},
					branchB: {
						chain: this.buildChain(
							nodes,
							prevToChildren,
							firstChildFromParent(nodes, parentId, bId),
							bId,
						),
						statementDescription: this.describeStatement(
							intersected.rightStatement,
							rightInfo,
						),
						target: this.describeStatementTarget(
							intersected.rightStatement,
							rightInfo,
						),
						action: rightInfo.action,
					},
				});
			}
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

	private generateLeafFootprints(
		statements: TStatement[],
		_snapshot?: TSnapshot,
	): {
		statementHashes: Array<{ hash: string; statement: TStatement }>;
		conflictFootprints: Array<{ hash: string; statement: TStatement }>;
	} {
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

	private buildSnapshotGraph(
		snapshots: string[] | ParsedSnapshotInput[],
	): Record<string, SnapshotNode<TSnapshot>> {
		const byId: Record<string, SnapshotNode<TSnapshot>> = {};
		for (const input of snapshots) {
			let file: string;
			// The engine accepts snapshots whose shape we only know to have `id`
			// and `prevIds`. The full snapshot is then handed to the dialect's
			// `diffSnapshots`, which is the only place that requires the rest
			// of `TSnapshot` and is responsible for that contract.
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
