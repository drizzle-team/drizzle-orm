import { type Footprint, FootprintCommutativity, type ParsedSnapshotInput } from '../../commutativity/engine';
import { describeFootprint, type FamilyProfile, footprintOf } from '../postgres-family/commutativity-rules';
import { builtinPolicyRoles } from './grammar';
import type { CockroachSnapshot } from './snapshot';
import type { JsonStatement } from './statements';

const profile: FamilyProfile = {
	// Cockroach's index identity is `[schema, table, name]`, and a DROP or RENAME INDEX names the table in its
	// SQL too (`"s"."t"@"i"`), so two tables of a schema can share an index name.
	indexScope: 'table',
	builtinTypeSchema: 'pg_catalog',
	builtinPolicyRoles,
	// Cockroach has no serial type: a column never gets or loses an identity-backed sequence through a type
	// change the way a postgres serial column does.
	serial: null,
};

/**
 * Cockroach commutativity rules, on top of the shared rules of `../postgres-family/commutativity-rules`.
 *
 * `buildFootprint` decides which statements conflict. The description feeds only the report of `check`.
 */
export class CockroachCommutativity extends FootprintCommutativity<CockroachSnapshot> {
	protected override describe(footprint: Footprint) {
		return describeFootprint(footprint);
	}

	// Builds the footprint that a snapshot stores for a statement.
	public buildFootprint(statement: JsonStatement, sql: string[]): Footprint {
		return footprintOf(statement, sql, profile);
	}

	public override async detectNonCommutative(snapshots: string[] | ParsedSnapshotInput[]) {
		const nodes = this.buildSnapshotGraph(snapshots);
		// A cockroach snapshot of the delta format stores the footprints of its migration in `raw.footprints`.
		return this.detectBranchConflicts(
			nodes,
			(id) => (nodes[id].raw as { footprints?: Footprint[] }).footprints ?? [],
		);
	}
}

export const cockroachCommutativity = new CockroachCommutativity();

// Builds the footprints that a snapshot stores, from each statement of a diff and its SQL.
export const footprintsOf = (grouped: { jsonStatement: JsonStatement; sqlStatements: string[] }[]) =>
	grouped.map((it) => cockroachCommutativity.buildFootprint(it.jsonStatement, it.sqlStatements));
