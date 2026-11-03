import { type Footprint, FootprintCommutativity, type ParsedSnapshotInput } from '../../commutativity/engine';
import { describeFootprint, type FamilyProfile, footprintOf } from '../postgres-family/commutativity-rules';
import { builtinPolicyRoles, isSerialType } from './grammar';
import type { PostgresSnapshot } from './snapshot';
import type { JsonStatement } from './statements';

const profile: FamilyProfile = {
	indexScope: 'schema',
	builtinTypeSchema: 'pg_catalog',
	builtinPolicyRoles,
	serial: { isSerialType },
};

/**
 * Postgres-specific commutativity rules, on top of the shared rules of `../postgres-family/commutativity-rules`.
 *
 * `buildFootprint` decides which statements conflict. The description feeds only the report of `check`.
 */
class PostgresCommutativity extends FootprintCommutativity<PostgresSnapshot> {
	protected override describe(footprint: Footprint) {
		return describeFootprint(footprint);
	}

	// Builds the footprint that a snapshot stores for a statement.
	public buildFootprint(statement: JsonStatement, sql: string[]): Footprint {
		return footprintOf(statement, sql, profile);
	}

	public override async detectNonCommutative(snapshots: string[] | ParsedSnapshotInput[]) {
		const nodes = this.buildSnapshotGraph(snapshots);
		// A postgres snapshot stores the footprints of its migration in `raw.footprints`, so nothing is diffed.
		return this.detectBranchConflicts(nodes, (id) => nodes[id].raw.footprints);
	}
}

export const postgresCommutativity = new PostgresCommutativity();

// Builds the footprints that a snapshot stores, from each statement of a diff and its SQL.
export const footprintsOf = (grouped: { jsonStatement: JsonStatement; sqlStatements: string[] }[]) =>
	grouped.map((it) => postgresCommutativity.buildFootprint(it.jsonStatement, it.sqlStatements));
