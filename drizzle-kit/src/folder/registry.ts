import type { handle as postgresGenerate } from '../cli/commands/generate-postgres';
import type { ParsedSnapshotInput } from '../commutativity/engine';
import type { NonCommutativityReport } from '../commutativity/types';
import { cockroachCommutativity } from '../dialects/cockroach/commutativity';
import { type CockroachMigrationsFolder, readFolder as readCockroachFolder } from '../dialects/cockroach/folder';
import { postgresCommutativity } from '../dialects/postgres/commutativity';
import {
	type MigrationsFolder as PostgresMigrationsFolder,
	readFolder as readPostgresFolder,
} from '../dialects/postgres/folder';
import type { Dialect } from '../utils/schemaValidator';
import type { CheckWarning } from './check-schema';
import type { MigrationsFolder } from './history';
import type { FolderSnapshot } from './reconstruct';

// A dialect has the delta format when it reads a migrations folder itself and has a commutativity instance. The
// commands read the format from this registry, and a dialect without an entry keeps the older behavior: it
// stores the full state in every snapshot and cannot fix a conflict by deleting migrations.
export type DeltaFormat = {
	readFolder: (out: string) => MigrationsFolder<FolderSnapshot>;
	commutativity: {
		detectNonCommutative: (snapshots: string[] | ParsedSnapshotInput[]) => Promise<NonCommutativityReport>;
	};
	// The generate handler of a delta-format dialect reads the folder itself, because it can delete the
	// conflicting migrations and then generate.
	generate: () => Promise<{ handle: typeof postgresGenerate }>;
	// Compares the schema files with the migrations, when `check` gets a schema path.
	schemaWarnings?: (migrations: MigrationsFolder<FolderSnapshot>, filenames: string[]) => Promise<CheckWarning[]>;
};

const deltaFormats: Partial<Record<Dialect, DeltaFormat>> = {
	cockroach: {
		readFolder: readCockroachFolder,
		commutativity: cockroachCommutativity,
		generate: () => import('../cli/commands/generate-cockroach'),
		schemaWarnings: async (migrations, filenames) => {
			const { schemaWarnings } = await import('../cli/commands/check-cockroach');
			return schemaWarnings(migrations as CockroachMigrationsFolder, filenames);
		},
	},
	postgresql: {
		readFolder: readPostgresFolder,
		commutativity: postgresCommutativity,
		generate: () => import('../cli/commands/generate-postgres'),
		schemaWarnings: async (migrations, filenames) => {
			const { SchemaSource } = await import('../dialects/postgres/drizzle');
			const { schemaWarnings } = await import('../cli/commands/check-postgres');
			return schemaWarnings(migrations as PostgresMigrationsFolder, SchemaSource.fromFilenames(filenames));
		},
	},
};

export const deltaFormatOf = (dialect: Dialect): DeltaFormat | undefined => deltaFormats[dialect];

export const usesDeltaFormat = (dialect: Dialect): boolean => deltaFormatOf(dialect) !== undefined;
