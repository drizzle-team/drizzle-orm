let jsonMode = false;

export const setJsonMode = (value: boolean): void => {
	jsonMode = value;
};

export const isJsonMode = (): boolean => {
	return jsonMode;
};
