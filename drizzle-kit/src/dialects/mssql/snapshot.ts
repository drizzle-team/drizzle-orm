import { randomUUID } from 'crypto';
import { originUUID } from '../../utils';
import { array, validator } from '../simpleValidator';
import type { MssqlDDL, MssqlEntity, MssqlEntityV1 } from './ddl';
import { createDDL, createDDLV1, createDDLV2 } from './ddl';

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

const ddlV2 = createDDLV2();
export const snapshotValidatorV2 = validator({
	version: ['2'],
	dialect: ['mssql'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<MssqlEntityV2>((it) => ddlV2.entities.validate(it)),
	renames: array<string>((_) => true),
});

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['3'],
	dialect: ['mssql'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<MssqlEntity>((it) => ddl.entities.validate(it)),
	renames: array<string>((_) => true),
});

export type MssqlSnapshotV1 = typeof snapshotValidatorV1.shape;
export type MssqlSnapshotV2 = typeof snapshotValidatorV2.shape;
export type MssqlSnapshot = typeof snapshotValidator.shape;
export type MssqlEntityV2 = ReturnType<ReturnType<typeof createDDLV2>['entities']['list']>[number];

export const toJsonSnapshot = (ddl: MssqlDDL, prevIds: string[], renames: string[]): MssqlSnapshot => {
	return { dialect: 'mssql', id: randomUUID(), prevIds, version: '3', ddl: ddl.entities.list(), renames };
};

export const drySnapshot = snapshotValidator.strict(
	{
		version: '3',
		dialect: 'mssql',
		id: originUUID,
		prevIds: [],
		ddl: [],
		renames: [],
	} satisfies MssqlSnapshot,
);
