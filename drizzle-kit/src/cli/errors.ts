import { error, errText, info } from './views';

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type DrizzleCliErrorMeta = Record<string, JsonValue>;

export class DrizzleCliError extends Error {
	readonly code: string;
	readonly meta?: DrizzleCliErrorMeta;
	readonly humanMessage: string;

	constructor(code: string, humanMessage: string, meta?: DrizzleCliErrorMeta, options?: ErrorOptions) {
		super(humanMessage, options);
		this.name = new.target.name;
		this.code = code;
		this.meta = meta;
		this.humanMessage = humanMessage;
	}
}

export class OrmVersionCliError extends DrizzleCliError {
	constructor(humanMessage: string, kind: 'orm_missing' | 'orm_too_old' | 'kit_outdated') {
		super('orm_version_error', humanMessage, { kind });
	}
}

export class RequiredPackagesCliError extends DrizzleCliError {
	constructor(packages: string[]) {
		super(
			'required_packages_error',
			errText(`please install required packages: ${packages.map((it) => `'${it}'`).join(' ')}`),
			{ packages },
		);
	}
}

export class RequiredEitherPackagesCliError extends DrizzleCliError {
	constructor(packages: string[]) {
		super(
			'required_either_packages_error',
			errText(`Please install one of those packages are needed: ${packages.map((it) => `'${it}'`).join(' or ')}`),
			{ packages },
		);
	}
}

export class StudioNodeVersionCliError extends DrizzleCliError {
	constructor() {
		super('studio_node_version_error', errText('Drizzle Studio requires NodeJS v18 or above'));
	}
}

export class AmbiguousParamsCliError extends DrizzleCliError {
	constructor(command: string, humanMessage: string) {
		super('ambiguous_params_error', humanMessage, {
			command,
			configOption: 'config',
		});
	}
}

export class MissingRequiredParamsCliError extends DrizzleCliError {
	constructor(params: string[]) {
		super('missing_required_params_error', `Please provide required params: ${params.join(', ')}`, { params });
	}
}

export class RequiredParamsCliError extends DrizzleCliError {
	constructor(params: string[], humanMessage: string) {
		super('missing_required_params_error', humanMessage, { params });
	}
}

export class ConfigFileNotFoundCliError extends DrizzleCliError {
	constructor(path: string) {
		super('config_file_not_found_error', `${path} file does not exist`, { path });
	}
}

export class ConfigValidationCliError extends DrizzleCliError {
	constructor(humanMessage: string, issues?: JsonValue[], options?: ErrorOptions) {
		super('config_validation_error', humanMessage, issues ? { issues } : undefined, options);
	}
}

export class MissingConfigDialectCliError extends DrizzleCliError {
	constructor() {
		super('missing_config_dialect_error', error("Please specify 'dialect' param in config file"), { field: 'dialect' });
	}
}

export class UnsupportedSnapshotVersionCliError extends DrizzleCliError {
	constructor(path: string) {
		super(
			'unsupported_snapshot_version_error',
			info(`${path} snapshot is of unsupported version, please update drizzle-kit`),
			{ path },
		);
	}
}

export class MigrationSnapshotNotFoundCliError extends DrizzleCliError {
	constructor(snapshotPath?: string) {
		super('migration_snapshot_not_found_error', 'No snapshot was found', snapshotPath ? { snapshotPath } : undefined);
	}
}

export class MigrationSqlFilesConflictCliError extends DrizzleCliError {
	constructor(prefix?: string) {
		super('migration_sql_files_conflict_error', 'Several sql files were found', prefix ? { prefix } : undefined);
	}
}

export class UnsupportedCommandDialectCliError extends DrizzleCliError {
	constructor(command: string, dialect: string) {
		super('unsupported_command_dialect_error', error(`You can't use '${command}' command with ${dialect} dialect`), {
			command,
			dialect,
		});
	}
}

export class UnsupportedCommandCliError extends DrizzleCliError {
	constructor(command: string, humanMessage: string, meta?: DrizzleCliErrorMeta) {
		super('unsupported_command_dialect_error', humanMessage, {
			command,
			...meta,
		});
	}
}

export class MissingDialectCliError extends DrizzleCliError {
	constructor(humanMessage: string) {
		super('missing_required_params_error', humanMessage, {
			params: ['dialect'],
		});
	}
}

export class ConfigConnectionCliError extends DrizzleCliError {
	constructor(driver: string, params: string[], humanMessage: string, command?: string) {
		super('config_connection_error', humanMessage, {
			driver,
			params,
			...(command ? { command } : {}),
		});
	}
}

export class DatabaseDriverCliError extends DrizzleCliError {
	constructor(database: string, packages: string[], humanMessage: string, note?: string) {
		super('database_driver_error', humanMessage, {
			database,
			packages,
			...(note ? { note } : {}),
		});
	}
}

export class ConnectionStringDatabaseCliError extends DrizzleCliError {
	constructor(driver: string, humanMessage: string) {
		super('connection_string_database_error', humanMessage, { driver });
	}
}

export class GelProjectLinkCliError extends DrizzleCliError {
	constructor() {
		super(
			'gel_project_link_error',
			`It looks like you forgot to link the Gel project or provide the database credentials.
To link your project, please refer https://docs.geldata.com/reference/cli/gel_instance/gel_instance_link, or add the dbCredentials to your configuration file.`,
		);
	}
}

export class CommandOutputCliError extends DrizzleCliError {
	constructor(command: string, humanMessage: string, meta?: DrizzleCliErrorMeta) {
		super('command_output_error', humanMessage, { command, ...meta });
	}
}

export class OrmDriverVersionCliError extends DrizzleCliError {
	constructor(driver: string, minVersion: string, humanMessage: string) {
		super('orm_driver_version_error', humanMessage, { driver, minVersion });
	}
}

export class CheckCliError extends DrizzleCliError {
	constructor(
		kind: 'unsupported' | 'malformed' | 'non_latest' | 'conflicts',
		humanMessage: string,
		meta?: DrizzleCliErrorMeta,
	) {
		super('check_error', humanMessage, { kind, ...meta });
	}
}

export class InvalidHintsCliError extends DrizzleCliError {
	constructor(humanMessage: string, meta?: DrizzleCliErrorMeta, options?: ErrorOptions) {
		super('invalid_hints', humanMessage, meta, options);
	}
}
