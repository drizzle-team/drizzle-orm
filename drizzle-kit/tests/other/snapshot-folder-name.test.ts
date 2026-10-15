import { expect, test } from 'vitest';
import { prepareSnapshotFolderName } from '../../src/cli/commands/generate-common';

test('snapshot folder name is not affected by timezone', () => {
	// 2026-12-31 18:00 UTC is already 2027-01-01 02:00 at UTC+8
	const createdAt = Date.parse('2026-12-31T18:00:00Z');
	const originalTz = process.env.TZ;
	try {
		process.env.TZ = 'UTC';
		expect(prepareSnapshotFolderName(createdAt)).toBe('20261231180000');
		process.env.TZ = 'Asia/Singapore';
		expect(prepareSnapshotFolderName(createdAt)).toBe('20261231180000');
	} finally {
		if (originalTz === undefined) delete process.env.TZ;
		else process.env.TZ = originalTz;
	}
});
