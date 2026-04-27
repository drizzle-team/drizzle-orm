import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import type { NonCommutativityReport, UnifiedBranchConflict } from './types';

type SnapshotNode<TSnapshot extends { id: string; prevIds: string[] }> = {
	id: string;
	prevIds: string[];
	path: string;
	folderPath: string;
	raw: TSnapshot;
};

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
		snapshots: string[],
	): Promise<NonCommutativityReport> {
		const nodes = this.buildSnapshotGraph(snapshots);
		const prevToChildren: Record<string, string[]> = {};

		for (const node of Object.values(nodes)) {
			for (const parentId of node.prevIds) {
				const arr = prevToChildren[parentId] ?? [];
				arr.push(node.id);
				prevToChildren[parentId] = arr;
			}
		}

		const conflicts: UnifiedBranchConflict[] = [];
		const commutativeBranches: NonCommutativityReport['commutativeBranches'] = [];

		for (const [prevId, childIds] of Object.entries(prevToChildren)) {
			if (childIds.length <= 1) continue;

			const parentNode = nodes[prevId];
			const childToLeaves: Record<string, string[]> = {};

			for (const childId of childIds) {
				childToLeaves[childId] = this.collectLeaves(nodes, childId);
			}

			const leafStatements: Record<
				string,
				{ statements: TStatement[]; path: string }
			> = {};

			for (const leaves of Object.values(childToLeaves)) {
				for (const leafId of leaves) {
					const leafNode = nodes[leafId]!;
					const parentSnapshot = parentNode
						? parentNode.raw
						: this.getDrySnapshot();
					const { statements } = await this.diffSnapshots(
						parentSnapshot,
						leafNode.raw,
					);
					leafStatements[leafId] = {
						statements,
						path: leafNode.folderPath,
					};
				}
			}

			let hasConflict = false;

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

							const aStatements = leafStatements[aId]!.statements;
							const bStatements = leafStatements[bId]!.statements;
							const parentSnapshot = parentNode
								? parentNode.raw
								: this.getDrySnapshot();

							const intersected = await this.getReasonsFromStatements(
								aStatements,
								bStatements,
								parentSnapshot,
							);

							if (!intersected) continue;

							hasConflict = true;
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
								branchA: {
									chain: chainA,
									statementDescription: this.describeStatement(
										intersected.leftStatement,
										this.resolveStatement(intersected.leftStatement).info,
									),
								},
								branchB: {
									chain: chainB,
									statementDescription: this.describeStatement(
										intersected.rightStatement,
										this.resolveStatement(intersected.rightStatement).info,
									),
								},
							});
						}
					}
				}
			}

			const uniqueLeafIds = Array.from(new Set(Object.values(childToLeaves).flat()));
			if (hasConflict || uniqueLeafIds.length <= 1) {
				continue;
			}

			const parentSnapshot = parentNode ? parentNode.raw : this.getDrySnapshot();
			const leafs = uniqueLeafIds.map((leafId) => ({
				id: leafId,
				path: leafStatements[leafId]?.path ?? nodes[leafId]?.folderPath ?? leafId,
				statements: leafStatements[leafId]?.statements ?? [],
			}));

			commutativeBranches.push({
				parentId: prevId,
				parentPath: parentNode?.folderPath,
				parentSnapshot,
				leafs,
			});
		}

		const allNodeIds = new Set(Object.keys(nodes));
		const parentIds = new Set(Object.keys(prevToChildren));
		const leafNodes = Array.from(allNodeIds).filter((id) => !parentIds.has(id));

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
		for (const hashInfoA of branchAHashes) {
			for (const conflictInfoB of branchBConflicts) {
				if (hashInfoA.hash === conflictInfoB.hash) {
					return {
						leftStatement: hashInfoA.statement,
						rightStatement: conflictInfoB.statement,
					};
				}
			}
		}

		for (const hashInfoB of branchBHashes) {
			for (const conflictInfoA of branchAConflicts) {
				if (hashInfoB.hash === conflictInfoA.hash) {
					return {
						leftStatement: hashInfoB.statement,
						rightStatement: conflictInfoA.statement,
					};
				}
			}
		}
	}

	private buildSnapshotGraph(
		snapshotFiles: string[],
	): Record<string, SnapshotNode<TSnapshot>> {
		const byId: Record<string, SnapshotNode<TSnapshot>> = {};
		for (const file of snapshotFiles) {
			if (!existsSync(file)) continue;
			const raw = JSON.parse(readFileSync(file, 'utf8')) as TSnapshot;
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

	private collectLeaves(
		graph: Record<string, SnapshotNode<TSnapshot>>,
		startId: string,
	): string[] {
		const leaves: string[] = [];
		const stack: string[] = [startId];
		const prevToChildren: Record<string, string[]> = {};

		for (const node of Object.values(graph)) {
			for (const parentId of node.prevIds) {
				const arr = prevToChildren[parentId] ?? [];
				arr.push(node.id);
				prevToChildren[parentId] = arr;
			}
		}

		while (stack.length) {
			const id = stack.pop()!;
			const children = prevToChildren[id] ?? [];
			if (children.length === 0) {
				leaves.push(id);
			} else {
				for (const child of children) stack.push(child);
			}
		}

		return leaves;
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
