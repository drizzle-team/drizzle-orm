import { beforeEach } from 'vitest';

export function skipTests(names: string[]) {
	beforeEach((ctx) => {
		if (ctx.task.suite?.name === 'common' && names.includes(ctx.task.name)) {
			ctx.skip();
		}
	});
}
