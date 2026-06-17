import { AbstractCommutativity, type CommutativityStatementDefinitions } from 'src/commutativity/engine';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import { describe, expect, test } from 'vitest';

/**
 * Regression coverage for `AbstractCommutativity.collectLeaves`.
 *
 * `collectLeaves` walks the migration-snapshot DAG (parent -> children) with a
 * stack-based DFS to find every reachable leaf below a starting node. Before the
 * fix it had NO visited set, so any node reachable through more than one path was
 * re-expanded once per path. On a branched/merged history (diamonds that
 * reconverge, e.g. real repos with merge migrations) this is exponential in the
 * number of merge points: a chain of N diamonds produces ~2^N stack expansions,
 * which makes `drizzle-kit generate`'s pre-step commutativity check hang for
 * minutes (CPU-bound) before any schema work happens.
 *
 * The sibling `buildChain` in the same class already guards with a visited Set;
 * `collectLeaves` now does the same. These tests assert both correctness
 * (deduplicated leaves) and bounded runtime on a diamond-heavy DAG.
 *
 * `collectLeaves` is private, so a tiny test-only subclass exposes it. The graph
 * it consumes is keyed by snapshot id with `{ id, prevIds }` nodes, matching what
 * `buildSnapshotGraph` produces.
 */

type GraphNode = {
	id: string;
	prevIds: string[];
	path: string;
	folderPath: string;
	raw: PostgresSnapshot;
};

class TestCommutativity extends AbstractCommutativity<
	{ type: string },
	PostgresSnapshot,
	unknown
> {
	protected getStatementDefinitions(): CommutativityStatementDefinitions<
		{ type: string },
		unknown
	> {
		return {} as CommutativityStatementDefinitions<{ type: string }, unknown>;
	}

	protected formatFootprintTarget(): string {
		return '';
	}

	protected describeStatement(): string {
		return '';
	}

	protected getDrySnapshot(): PostgresSnapshot {
		return {} as PostgresSnapshot;
	}

	protected async diffSnapshots(): Promise<{ statements: { type: string }[] }> {
		return { statements: [] };
	}

	// Expose the private DFS for focused regression testing.
	public collectLeavesForTest(
		graph: Record<string, GraphNode>,
		startId: string,
	): string[] {
		// @ts-expect-error accessing private member for regression coverage
		return this.collectLeaves(graph, startId);
	}
}

function node(id: string, prevIds: string[]): GraphNode {
	return {
		id,
		prevIds,
		path: `${id}/snapshot.json`,
		folderPath: id,
		raw: { id, prevIds } as unknown as PostgresSnapshot,
	};
}

function graphFromNodes(nodes: GraphNode[]): Record<string, GraphNode> {
	const byId: Record<string, GraphNode> = {};
	for (const n of nodes) byId[n.id] = n;
	return byId;
}

describe('AbstractCommutativity.collectLeaves', () => {
	const engine = new TestCommutativity();

	test('linear chain returns the single leaf', () => {
		const graph = graphFromNodes([
			node('a', []),
			node('b', ['a']),
			node('c', ['b']),
		]);

		expect(engine.collectLeavesForTest(graph, 'a')).toEqual(['c']);
	});

	test('diamond (reconverging branch) returns the shared leaf exactly once', () => {
		// a -> b, a -> c, then b -> d and c -> d (d has two parents).
		const graph = graphFromNodes([
			node('a', []),
			node('b', ['a']),
			node('c', ['a']),
			node('d', ['b', 'c']),
		]);

		const leaves = engine.collectLeavesForTest(graph, 'a');

		// Without a visited set the merged leaf `d` would be reported twice.
		expect(leaves).toEqual(['d']);
	});

	test('multiple distinct leaves under a branch point are all returned', () => {
		const graph = graphFromNodes([
			node('a', []),
			node('b', ['a']),
			node('c', ['a']),
			node('leafB', ['b']),
			node('leafC', ['c']),
		]);

		expect(engine.collectLeavesForTest(graph, 'a').sort()).toEqual([
			'leafB',
			'leafC',
		]);
	});

	test('chain of many reconverging diamonds completes in bounded time', () => {
		// Build N stacked diamonds: each "merge" node mK has two parents
		// (the previous merge's two children) and fans out again. Without the
		// visited-set fix this is ~2^N stack expansions; 60 diamonds would hang
		// for an extremely long time. With the fix it is O(nodes).
		const N = 60;
		const nodes: GraphNode[] = [node('m0', [])];
		for (let k = 0; k < N; k++) {
			const parent = `m${k}`;
			const left = `l${k}`;
			const right = `r${k}`;
			const merge = `m${k + 1}`;
			nodes.push(node(left, [parent]));
			nodes.push(node(right, [parent]));
			nodes.push(node(merge, [left, right]));
		}
		const graph = graphFromNodes(nodes);

		const start = performance.now();
		const leaves = engine.collectLeavesForTest(graph, 'm0');
		const elapsedMs = performance.now() - start;

		// Single final merge node is the only leaf, reported once.
		expect(leaves).toEqual([`m${N}`]);
		// Generous bound: the fixed traversal is sub-millisecond; the buggy
		// exponential version cannot finish anywhere near this.
		expect(elapsedMs).toBeLessThan(2000);
	});
});
