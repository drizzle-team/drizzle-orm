import { randomUUID } from 'crypto';
import { originUUID } from '../../utils';
import { array, validator } from '../simpleValidator';
import type { MssqlDDL, MssqlEntity, MssqlEntityV1 } from './ddl';
import { createDDL, createDDLV1 } from './ddl';

// v1
// old
const ddlV1 = createDDLV1();
export const snapshotValidatorV1 = validator({
	version: ['1'],
	dialect: ['mssql'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<MssqlEntityV1>((it) => ddlV1.entities.validate(it)),
	renames: array<string>((_) => true),
});

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['2'],
	dialect: ['mssql'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<MssqlEntity>((it) => ddl.entities.validate(it)),
	renames: array<string>((_) => true),
});

export type MssqlSnapshotV1 = typeof snapshotValidatorV1.shape;
export type MssqlSnapshot = typeof snapshotValidator.shape;

export const toJsonSnapshot = (ddl: MssqlDDL, prevIds: string[], renames: string[]): MssqlSnapshot => {
	return { dialect: 'mssql', id: randomUUID(), prevIds, version: '2', ddl: ddl.entities.list(), renames };
};

export const drySnapshot = snapshotValidator.strict(
	{
		version: '2',
		dialect: 'mssql',
		id: originUUID,
		prevIds: [],
		ddl: [],
		renames: [],
	} satisfies MssqlSnapshot,
);
