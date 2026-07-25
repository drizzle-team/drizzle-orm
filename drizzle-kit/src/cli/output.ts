export const MACHINE_OUTPUT_ENV = 'DRIZZLE_KIT_MACHINE_OUTPUT';

export const isMachineOutputEnabled = () => process.env[MACHINE_OUTPUT_ENV] === '1';

export const writeInfoOutput = (
	message: string,
	options?: { machineReadable?: boolean },
) => {
	const machineReadable = options?.machineReadable ?? isMachineOutputEnabled();
	if (machineReadable) {
		console.error(message);
		return;
	}
	console.log(message);
};

export const withMachineOutput = async <T>(
	enabled: boolean,
	action: () => Promise<T>,
): Promise<T> => {
	const previous = process.env[MACHINE_OUTPUT_ENV];
	if (enabled) {
		process.env[MACHINE_OUTPUT_ENV] = '1';
	} else {
		delete process.env[MACHINE_OUTPUT_ENV];
	}

	try {
		return await action();
	} finally {
		if (typeof previous === 'string') {
			process.env[MACHINE_OUTPUT_ENV] = previous;
		} else {
			delete process.env[MACHINE_OUTPUT_ENV];
		}
	}
};
