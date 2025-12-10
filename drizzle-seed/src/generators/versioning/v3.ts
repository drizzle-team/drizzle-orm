import { AbstractGenerator } from '../Generators.ts';

/* eslint-disable drizzle-internal/require-entity-kind */
export class GenerateHashFromStringV3 extends AbstractGenerator<{}> {
	static override readonly entityKind: string = 'GenerateHashFromString';
	static override readonly version: number = 3;

	override init() {}
	generate({ input }: { i: number; input: string }) {
		let hash = 0n;
		// p and m are prime numbers
		const p = 53n;
		const m = 28871271685163n; // < 2^53

		let power = 1n; // will track p^i, where i is character index

		for (const ch of input) {
			hash = (hash + (BigInt(ch.codePointAt(0) || 0) * power)) % m;
			power = (power * p) % m;
		}

		return Number(hash);
	}
}
