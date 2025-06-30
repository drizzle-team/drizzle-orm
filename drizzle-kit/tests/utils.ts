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
