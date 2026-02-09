/**
 * DSQL Snapshot Module
 *
 * Defines the snapshot format for DSQL migrations.
 * DSQL reuses PostgreSQL's DDL entity structure but has its own dialect identifier.
 */

import { randomUUID } from 'crypto';
import { originUUID } from '../../utils';
import type { PostgresDDL, PostgresEntity } from '../postgres/ddl';
import { array, validator } from '../simpleValidator';

/**
 * DSQL snapshot type.
 * Uses the same DDL entity structure as PostgreSQL.
 */
export type DSQLSnapshot = {
	version: '1';
	dialect: 'dsql';
	id: string;
	prevIds: string[];
	ddl: PostgresEntity[];
	renames: string[];
};

/**
 * Validator for DSQL snapshots.
 */
export const snapshotValidator = validator({
	version: ['1'],
	dialect: ['dsql'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<PostgresEntity>((_) => true),
	renames: array<string>((_) => true),
});

/**
 * Converts DDL to JSON snapshot format.
 */
export const toJsonSnapshot = (ddl: PostgresDDL, prevIds: string[], renames: string[]): DSQLSnapshot => {
	return {
		dialect: 'dsql',
		id: randomUUID(),
		prevIds,
		version: '1',
		ddl: ddl.entities.list(),
		renames,
	};
};

/**
 * Empty/dry snapshot for initial migrations.
 */
export const drySnapshot: DSQLSnapshot = snapshotValidator.strict({
	version: '1',
	dialect: 'dsql',
	id: originUUID,
	prevIds: [],
	ddl: [],
	renames: [],
});
