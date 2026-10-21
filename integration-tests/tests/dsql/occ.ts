const occErrorCodes = new Set(['OC000', 'OC001', '40001']);

const isOccError = (error: unknown): boolean => {
	for (let e: any = error, depth = 0; e && typeof e === 'object' && depth < 8; e = e.cause, ++depth) {
		if (typeof e.code === 'string' && occErrorCodes.has(e.code)) return true;
	}

	return false;
};

export async function retryOcc<T>(run: () => Promise<T>, maxRetries = 5): Promise<T> {
	for (let attempt = 0;; ++attempt) {
		try {
			return await run();
		} catch (error) {
			if (attempt >= maxRetries || !isOccError(error)) throw error;

			await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
		}
	}
}
