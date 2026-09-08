import prand from 'pure-rand';
import { AbstractGenerator } from '../Generators.ts';

/* eslint-disable drizzle-internal/require-entity-kind */
export class GenerateUUIDV4 extends AbstractGenerator<{
	arraySize?: number;
}> {
	static override readonly entityKind: string = 'GenerateUUID';
	static override readonly version: number = 4;

	public override isGeneratorUnique = true;
	public override maxUniqueCount: number = Number.POSITIVE_INFINITY;

	private state: { rng: prand.RandomGenerator } | undefined;

	override getMaxUniqueCount(): number {
		return Number.POSITIVE_INFINITY;
	}

	override init({ count, seed }: { count: number; seed: number }) {
		super.init({ count, seed });

		const rng = prand.xoroshiro128plus(seed);
		this.state = { rng };
	}

	generate() {
		if (this.state === undefined) {
			throw new Error('state is not defined.');
		}
		// TODO generate uuid using string generator
		const stringChars = '1234567890abcdef';
		let idx: number,
			currStr: string;
		const strLength = 36;

		// uuid v4
		const uuidTemplate = '########-####-4###-N###-############';
		currStr = '';
		for (let i = 0; i < strLength; i++) {
			[idx, this.state.rng] = prand.uniformIntDistribution(
				0,
				stringChars.length - 1,
				this.state.rng,
			);

			if (uuidTemplate[i] === '#') {
				currStr += stringChars[idx];
				continue;
			}

			// used this pr -> https://github.com/drizzle-team/drizzle-orm/pull/4503
			if (uuidTemplate[i] === 'N') {
				currStr += '89ab'[idx % 4];
				continue;
			}

			currStr += uuidTemplate[i];
		}
		return currStr;
	}
}
