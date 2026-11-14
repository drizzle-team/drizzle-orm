// Pure unit tests for the wire protocol (no database). Byte-exact golden checks
// for the writers, chunk-reassembly + guards for the Parser, and the decoders.
import { describe, expect, test } from 'bun:test';
import { encodeParam } from '../../src/encode.ts';
import {
	parseCommandComplete,
	parseDataRow,
	parseParameterDescription,
	Parser,
	parseRowDescription,
	W,
} from '../../src/protocol.ts';

const u16 = (n: number) => {
	const b = Buffer.allocUnsafe(2);
	b.writeUInt16BE(n);
	return b;
};
const i32 = (n: number) => {
	const b = Buffer.allocUnsafe(4);
	b.writeInt32BE(n);
	return b;
};

describe('W.* writers — byte-exact golden', () => {
	test('sync / flush / terminate', () => {
		expect([...W.sync()]).toEqual([0x53, 0, 0, 0, 4]);
		expect([...W.flush()]).toEqual([0x48, 0, 0, 0, 4]);
		expect([...W.terminate()]).toEqual([0x58, 0, 0, 0, 4]);
	});
	test('execute(maxRows=0)', () => {
		expect([...W.execute('', 0)]).toEqual([0x45, 0, 0, 0, 9, 0x00, 0, 0, 0, 0]);
	});
	test('describe statement', () => {
		expect([...W.describe('S', '')]).toEqual([0x44, 0, 0, 0, 6, 0x53, 0x00]);
	});
	test('password', () => {
		expect([...W.password('x')]).toEqual([0x70, 0, 0, 0, 6, 0x78, 0x00]);
	});
	test('sslRequest magic', () => {
		expect([...W.sslRequest()]).toEqual([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]);
	});
	test('startup: self-consistent length + protocol 196608 + pairs', () => {
		const b = W.startup({ user: 'u', database: 'd' });
		expect(b.readInt32BE(0)).toBe(b.length); // length prefix covers itself
		expect(b.readInt32BE(4)).toBe(196608); // protocol 3.0
		expect(b.includes(Buffer.from('user\0u\0'))).toBe(true);
		expect(b.includes(Buffer.from('database\0d\0'))).toBe(true);
		expect(b[b.length - 1]).toBe(0); // final terminator
	});
	test('parse: framed, type P, self-consistent length', () => {
		const b = W.parse('', 'select 1');
		expect(b[0]).toBe(0x50);
		expect(b.readInt32BE(1)).toBe(b.length - 1);
		expect(b.includes(Buffer.from('select 1\0'))).toBe(true);
	});
	test('bind: empty params framed correctly', () => {
		const b = W.bind('', '', []);
		expect(b[0]).toBe(0x42);
		expect(b.readInt32BE(1)).toBe(b.length - 1);
	});
	test('bind: rejects > 65535 params (no RangeError/overflow)', () => {
		const many = new Array(65536).fill({ format: 0, bytes: null });
		expect(() => W.bind('', '', many)).toThrow(/too many bind parameters/);
	});
	test('parse: rejects NUL in SQL', () => {
		expect(() => W.parse('', 'select 1\0; drop')).toThrow(/NUL/);
	});
});

describe('Parser — framing', () => {
	const Z = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]); // ReadyForQuery 'I'

	test('reassembles a message split across chunks', () => {
		const p = new Parser();
		expect(p.push(Z.subarray(0, 3))).toEqual([]); // partial
		const out = p.push(Z.subarray(3));
		expect(out.length).toBe(1);
		expect(out[0]!.type).toBe('Z');
		expect([...out[0]!.body]).toEqual([0x49]);
	});
	test('multiple messages in one chunk', () => {
		const p = new Parser();
		const out = p.push(Buffer.concat([Z, Z]));
		expect(out.map((m) => m.type)).toEqual(['Z', 'Z']);
	});
	test('byte-at-a-time still reassembles', () => {
		const p = new Parser();
		let out: ReturnType<Parser['push']> = [];
		for (const byte of Z) out = out.concat(p.push(Buffer.from([byte])));
		expect(out.length).toBe(1);
		expect(out[0]!.type).toBe('Z');
	});
	test('empty-body message (len=4) is valid', () => {
		const p = new Parser();
		const out = p.push(Buffer.from([0x31, 0, 0, 0, 4])); // ParseComplete, empty body
		expect(out.length).toBe(1);
		expect(out[0]!.body.length).toBe(0);
	});
	test('negative / sub-minimum length throws (no infinite loop)', () => {
		expect(() => new Parser().push(Buffer.from([0x5a, 0xff, 0xff, 0xff, 0xff]))).toThrow(
			/invalid backend message length/,
		);
		expect(() => new Parser().push(Buffer.from([0x5a, 0, 0, 0, 3]))).toThrow(/invalid backend message length/);
	});
});

describe('Parser — messages cut across chunks', () => {
	const frame = (type: string, body: Buffer) => {
		const b = Buffer.alloc(5 + body.length);
		b.write(type, 0, 'latin1');
		b.writeInt32BE(body.length + 4, 1);
		body.copy(b, 5);
		return b;
	};
	const filled = (n: number, seed: number) => {
		const b = Buffer.alloc(n);
		for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 0xff;
		return b;
	};
	const feed = (p: Parser, stream: Buffer, sizes: () => number) => {
		const out: ReturnType<Parser['push']> = [];
		for (let off = 0; off < stream.length;) {
			const n = Math.min(sizes(), stream.length - off);
			// a copy per chunk, as a socket delivers them: the parser must not rely on one backing buffer
			out.push(...p.push(Buffer.from(stream.subarray(off, off + n))));
			off += n;
		}
		return out;
	};

	test('a large message over many chunks, with messages before and after it', () => {
		const big = filled(3_000_000, 7);
		const stream = Buffer.concat([
			frame('D', filled(10, 1)),
			frame('D', big),
			frame('C', filled(9, 2)),
			frame('Z', filled(1, 3)),
		]);
		const out = feed(new Parser(), stream, () => 65536);
		expect(out.map((m) => m.type)).toEqual(['D', 'D', 'C', 'Z']);
		expect(out[1]!.body.equals(big)).toBe(true);
		expect(out[2]!.body.equals(filled(9, 2))).toBe(true);
		expect(out[3]!.body.equals(filled(1, 3))).toBe(true);
	});

	test('every cut position of a small stream gives the same messages', () => {
		const bodies = [filled(0, 1), filled(1, 2), filled(40, 3), filled(7, 4)];
		const stream = Buffer.concat(bodies.map((b, i) => frame('ABCD'[i]!, b)));
		for (let a = 1; a < stream.length; a++) {
			for (let b = a; b < stream.length; b += 5) {
				const p = new Parser();
				const out = [
					...p.push(Buffer.from(stream.subarray(0, a))),
					...p.push(Buffer.from(stream.subarray(a, b))),
					...p.push(Buffer.from(stream.subarray(b))),
				];
				expect(out.map((m) => m.type).join('')).toBe('ABCD');
				for (let i = 0; i < 4; i++) expect(out[i]!.body.equals(bodies[i]!)).toBe(true);
			}
		}
	});

	test('random message sizes and random chunk sizes', () => {
		let x = 12345;
		const rnd = (n: number) => (x = (x * 1103515245 + 12345) & 0x7fffffff) % n;
		const bodies: Buffer[] = [];
		for (let i = 0; i < 400; i++) bodies.push(filled(rnd(8) === 0 ? rnd(200_000) : rnd(300), i));
		const stream = Buffer.concat(bodies.map((b) => frame('D', b)));
		const out = feed(new Parser(), stream, () => 1 + rnd(rnd(4) === 0 ? 70_000 : 900));
		expect(out.length).toBe(bodies.length);
		for (let i = 0; i < bodies.length; i++) expect(out[i]!.body.equals(bodies[i]!)).toBe(true);
	});

	test('the frame header sits just before the body, joined or not', () => {
		const stream = Buffer.concat([frame('T', filled(20, 1)), frame('D', filled(5000, 2))]);
		for (const size of [stream.length, 1000, 3]) {
			const out = feed(new Parser(), stream, () => size);
			for (const m of out) {
				const whole = Buffer.from(m.body.buffer, m.body.byteOffset - 5, m.body.length + 5);
				expect(String.fromCharCode(whole[0]!)).toBe(m.type);
				expect(whole.readInt32BE(1)).toBe(m.body.length + 4);
			}
		}
	});

	test('a body handed out is not changed by later chunks', () => {
		const p = new Parser();
		const first = frame('D', filled(100, 1)), second = frame('D', filled(100, 2));
		const a = p.push(Buffer.concat([first, second.subarray(0, 50)]));
		const kept = a[0]!.body;
		const b = p.push(Buffer.from(second.subarray(50)));
		expect(kept.equals(filled(100, 1))).toBe(true);
		expect(b[0]!.body.equals(filled(100, 2))).toBe(true);
	});

	test('a bad length after a joined message still throws', () => {
		const p = new Parser();
		const ok = frame('D', filled(100, 1));
		p.push(Buffer.from(ok.subarray(0, 30)));
		expect(() => p.push(Buffer.concat([ok.subarray(30), Buffer.from([0x5a, 0, 0, 0, 3])]))).toThrow(
			/invalid backend message length/,
		);
	});
});

describe('Parser.feed — messages in place', () => {
	const frame = (type: string, body: Buffer) => {
		const b = Buffer.alloc(5 + body.length);
		b.write(type, 0, 'latin1');
		b.writeInt32BE(body.length + 4, 1);
		body.copy(b, 5);
		return b;
	};
	const filled = (n: number, seed: number) => {
		const b = Buffer.alloc(n);
		for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 0xff;
		return b;
	};

	test('gives the same messages as push(), in the same order, for any chunk size', () => {
		let x = 99;
		const rnd = (n: number) => (x = (x * 1103515245 + 12345) & 0x7fffffff) % n;
		const types = 'TDDDCZ';
		const bodies = Array.from({ length: 300 }, (_, i) => filled(rnd(6) === 0 ? rnd(90_000) : rnd(200), i));
		const stream = Buffer.concat(bodies.map((b, i) => frame(types[i % types.length]!, b)));
		for (const size of [1, 7, 4096, 65536, stream.length]) {
			const p = new Parser();
			const got: { type: string; body: Buffer }[] = [];
			for (let off = 0; off < stream.length; off += size) {
				p.feed(Buffer.from(stream.subarray(off, off + size)), (type, buf, start, end) => {
					// the frame header sits just before the body
					expect(buf[start - 5]).toBe(type);
					expect(buf.readInt32BE(start - 4)).toBe(end - start + 4);
					got.push({ type: String.fromCharCode(type), body: Buffer.from(buf.subarray(start, end)) });
				});
			}
			expect(got.length).toBe(bodies.length);
			for (let i = 0; i < bodies.length; i++) {
				expect(got[i]!.type).toBe(types[i % types.length]!);
				expect(got[i]!.body.equals(bodies[i]!)).toBe(true);
			}
		}
	});

	test('whole messages in one chunk are not copied', () => {
		const chunk = Buffer.concat([frame('D', filled(10, 1)), frame('D', filled(20, 2))]);
		const seen: Buffer[] = [];
		new Parser().feed(chunk, (_t, buf) => seen.push(buf));
		expect(seen.length).toBe(2);
		expect(seen[0]).toBe(chunk);
		expect(seen[1]).toBe(chunk);
	});

	test('a sink that throws does not get the same message twice', () => {
		const p = new Parser();
		const chunk = Buffer.concat([frame('A', filled(3, 1)), frame('B', filled(3, 2)), frame('C', filled(3, 3))]);
		const seen: string[] = [];
		expect(() =>
			p.feed(chunk, (type) => {
				seen.push(String.fromCharCode(type));
				if (type === 66) throw new Error('boom');
			})
		).toThrow('boom');
		expect(seen).toEqual(['A', 'B']);
	});
});

describe('parseRowDescription / parseDataRow', () => {
	test('row description decodes name + oid', () => {
		const body = Buffer.concat([u16(1), Buffer.from('id\0'), i32(0), u16(0), i32(23), u16(4), i32(-1), u16(0)]);
		const fields = parseRowDescription(body);
		expect(fields.length).toBe(1);
		expect(fields[0]!.name).toBe('id');
		expect(fields[0]!.dataTypeOid).toBe(23);
	});
	test('data row decodes values and NULL (-1)', () => {
		const body = Buffer.concat([u16(2), i32(3), Buffer.from('abc'), i32(-1)]);
		const cells = parseDataRow(body);
		expect(cells[0]?.toString()).toBe('abc');
		expect(cells[1]).toBeNull();
	});
	test('zero-column data row', () => {
		expect(parseDataRow(u16(0))).toEqual([]);
	});
	test('parameter description past 32767 params', () => {
		const n = 40_000;
		const body = Buffer.alloc(2 + n * 4);
		body.writeUInt16BE(n, 0);
		for (let i = 0; i < n; i++) body.writeInt32BE(i === n - 1 ? 25 : 23, 2 + i * 4);
		const oids = parseParameterDescription(body);
		expect(oids.length).toBe(n);
		expect(oids[n - 1]).toBe(25);
	});
});

describe('parseCommandComplete', () => {
	// the split + regex parser it replaced
	const reference = (tag: string) => {
		const m = tag.match(/(\d+)\s*$/);
		return { command: tag.split(' ')[0], rowCount: m ? parseInt(m[1]!, 10) : null };
	};
	const tags = [
		'SELECT 50',
		'SELECT 0',
		'INSERT 0 5',
		'UPDATE 3',
		'DELETE 1234',
		'MERGE 7',
		'COPY 100000',
		'FETCH 10',
		'MOVE 2',
		'BEGIN',
		'COMMIT',
		'ROLLBACK',
		'SET',
		'CREATE TABLE',
		'DROP INDEX',
		'SELECT 9007199254740991',
		'CREATE TABLE AS 3',
		'LISTEN',
	];
	for (const tag of tags) {
		test(tag, () => {
			const got: { command?: string | null; rowCount?: number | null } = {};
			parseCommandComplete(Buffer.from(tag + '\0', 'latin1'), got);
			expect(got).toEqual(reference(tag));
		});
	}
});

describe('encodeParam', () => {
	test('null -> SQL NULL', () => expect(encodeParam(null)).toEqual({ format: 0, bytes: null }));
	test('undefined -> SQL NULL', () => expect(encodeParam(undefined)).toEqual({ format: 0, bytes: null }));
	test('Buffer -> binary format', () => {
		const buf = Buffer.from([1, 2, 3]);
		expect(encodeParam(buf)).toEqual({ format: 1, bytes: buf });
	});
	test('boolean -> t/f text', () => {
		expect(encodeParam(true).bytes?.toString()).toBe('t');
		expect(encodeParam(false).bytes?.toString()).toBe('f');
	});
	test('Date -> ISO text', () => {
		expect(encodeParam(new Date('2020-01-02T03:04:05.000Z')).bytes?.toString()).toBe('2020-01-02T03:04:05.000Z');
	});
	test('object -> JSON text', () => {
		expect(encodeParam({ a: 1 }).bytes?.toString()).toBe('{"a":1}');
	});
	test('number -> text', () => expect(encodeParam(42).bytes?.toString()).toBe('42'));
	test('NUL byte in string -> throws', () => {
		expect(() => encodeParam('a\0b')).toThrow(/NUL/);
	});
});
