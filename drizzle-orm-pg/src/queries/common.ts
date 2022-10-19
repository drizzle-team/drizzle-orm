export abstract class QueryPromise<T> implements Promise<T> {
	[Symbol.toStringTag] = 'QueryPromise';

	catch<TResult = never>(
		onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined,
	): Promise<T | TResult> {
		return this.then(undefined, onRejected);
	}

	finally(onFinally?: (() => void) | null | undefined): Promise<T> {
		return this.then(
			(value) => {
				onFinally?.();
				return value;
			},
			(reason) => {
				onFinally?.();
				return Promise.reject(reason);
			},
		);
	}

	then<TResult1 = T, TResult2 = never>(
		onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
		onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
	): Promise<TResult1 | TResult2> {
		console.log('then() called');
		return this.execute().then(onFulfilled, onRejected);
	}

	protected abstract execute(): Promise<T>;
}
