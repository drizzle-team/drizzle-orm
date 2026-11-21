import { useEffect, useReducer } from 'react';

/** What `useMigrations` of the React Native drivers (`expo-sqlite`, `op-sqlite`) reports */
export interface MigrationsState {
	success: boolean;
	error?: Error;
}

type Action =
	| { type: 'migrating' }
	| { type: 'migrated'; payload: true }
	| { type: 'error'; payload: Error };

const initialState: MigrationsState = {
	success: false,
	error: undefined,
};

const reducer = (state: MigrationsState, action: Action): MigrationsState => {
	switch (action.type) {
		case 'migrating': {
			return { ...initialState };
		}
		case 'migrated': {
			return { ...initialState, success: action.payload };
		}
		case 'error': {
			return { ...initialState, error: action.payload };
		}
		default: {
			return state;
		}
	}
};

/** @internal Runs `migrate` once, when the component mounts, and reports how it went */
export function useMigrationsState(migrate: () => Promise<unknown>): MigrationsState {
	const [state, dispatch] = useReducer(reducer, initialState);

	useEffect(() => {
		dispatch({ type: 'migrating' });
		migrate().then(() => {
			dispatch({ type: 'migrated', payload: true });
		}).catch((error) => {
			dispatch({ type: 'error', payload: error as Error });
		});
	}, []);

	return state;
}
