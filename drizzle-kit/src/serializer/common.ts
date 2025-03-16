export type Entities = {
	INDEX: { name: string; columns: unknown[]; [key: string]: unknown };
	FK: any;
	PK: any;
	UNIQUE: any;
	CHECK: { name: string; [key: string]: unknown };
	SEQUENCE: any;
	IDENTITY: any;
	POLICY: any;
};

export interface Squasher<T extends Entities = Entities> {
	squashIdx: (idx: T['INDEX']) => string;
	unsquashIdx: (input: string) => T['INDEX'];
	squashFK: (fk: T['FK']) => string;
	unsquashFK: (input: string) => T['FK'];
	squashPK: (pk: T['PK']) => string;
	unsquashPK: (pk: string) => T['PK'];
	squashUnique: (unq: T['UNIQUE']) => string;
	unsquashUnique: (unq: string) => T['UNIQUE'];
	squashSequence: (seq: T['SEQUENCE']) => string;
	unsquashSequence: (seq: string) => T['SEQUENCE'];
	squashCheck: (check: T['CHECK']) => string;
	unsquashCheck: (input: string) => T['CHECK'];
	squashIdentity: (
		seq: T['IDENTITY'],
	) => string;
	unsquashIdentity: (
		seq: string,
	) => T['IDENTITY'];
	squashPolicy: (policy: T['POLICY']) => string;
	unsquashPolicy: (policy: string) => T['POLICY'];
}
