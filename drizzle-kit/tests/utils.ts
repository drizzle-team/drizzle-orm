export const measure = <T>(prom: Promise<T>, label: string): Promise<T> => {
	return new Promise<T>(async (res, rej) => {
		console.time(label);
		try {
			const result = await prom;
			console.timeEnd(label);
			res(result);
		} catch (e) {
			console.timeEnd(label);
			rej(e);
		}
	});
};

export const tsc = async (path: string) => {
	const typeCheckResult =
		await $`pnpm exec tsc --noEmit --skipLibCheck --target ES2020 --module NodeNext --moduleResolution NodeNext ${path}`
			.nothrow();
	if (typeCheckResult.exitCode !== 0) {
		throw new Error(typeCheckResult.stderr || typeCheckResult.stdout);
	}
};
