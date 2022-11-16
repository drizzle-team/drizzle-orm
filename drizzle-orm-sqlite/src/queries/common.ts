import { PreparedQuery } from '~/session';

export class Statement<T> {
	constructor(
		private query: PreparedQuery,
		private callback: (placeholderValues?: Record<string, unknown>) => T,
	) {
	}

	execute(placeholderValues?: Record<string, unknown>): T {
		return this.callback(placeholderValues);
	}

	finalize(): void {
		this.query.finalize?.();
	}
}
