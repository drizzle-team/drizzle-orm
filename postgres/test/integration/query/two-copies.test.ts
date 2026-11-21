import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geometry } from '../../../src/geometry.ts';
import { Connection, defineType } from '../../../src/index.ts';
import type * as driver from '../../../src/index.ts';
import { TEST_CONFIG, VARIANT } from '../../helpers/db.ts';

// A project can load two copies of the driver, for example the copy bundled in drizzle-orm next to the
// standalone package. A real second copy needs its own module graph, so the test copies the source
// directory and imports the connection from there. The markers come from the copy under test.
const srcDir = fileURLToPath(new URL('../../../src', import.meta.url));
let copyDir: string;
let conn: driver.Connection;

beforeAll(async () => {
	copyDir = await mkdtemp(join(tmpdir(), 'postgres-second-copy-'));
	await cp(srcDir, copyDir, { recursive: true });
	const other = (await import(join(copyDir, 'index.ts'))) as typeof driver;
	expect(other.Connection).not.toBe(Connection);
	conn = await other.connect({ ...TEST_CONFIG, decode: VARIANT });
});
afterAll(async () => {
	await conn?.end();
	if (copyDir) await rm(copyDir, { recursive: true, force: true });
});

const POINT = '0101000020E6100000000000000000F03F0000000000000040'; // SRID=4326 POINT(1 2)

test('geometry and defineType markers from one copy decode in the other copy', async () => {
	const complex = defineType('complex', {
		ascii: true,
		targets: { obj: (s) => ({ re: Number(s.slice(0, s.indexOf('+'))) }) },
	});
	const r = await conn.query(
		`select '${POINT}'::text g, '{"${POINT}"}'::text gs, '1.5+2i'::text c, '{"1+2i","3+4i"}'::text cs`,
		[],
		{ shape: { g: geometry('geojson'), gs: geometry.array('xy'), c: complex('obj'), cs: complex.array('obj') } },
	);
	expect(r.rows).toEqual([{
		g: { type: 'Point', coordinates: [1, 2], srid: 4326 },
		gs: [{ x: 1, y: 2 }],
		c: { re: 1.5 },
		cs: [{ re: 1 }, { re: 3 }],
	}]);
});

test('vector specs decode in either copy', async () => {
	const r = await conn.query(
		`select '[1,2.5]'::text v, '{"[1,2]","[3,4]"}'::text vs, '{1:1.5,3:2}/4'::text sv, '[0.5]'::text hv`,
		[],
		{ shape: { v: 'vector:array', vs: 'vector[]:array', sv: 'sparsevec:array', hv: 'halfvec:f32' } },
	);
	expect(r.rows).toEqual([{ v: [1, 2.5], vs: [[1, 2], [3, 4]], sv: [1.5, 0, 2, 0], hv: new Float32Array([0.5]) }]);
});
