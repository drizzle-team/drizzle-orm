import { JsonState } from '../json-state';

export class UpJsonState extends JsonState<{ upgradedFiles: string[] }> {
	private upgradedFiles: string[] = [];

	addUpgradedFile(path: string) {
		this.upgradedFiles.push(path);
	}

	protected payload() {
		return {
			upgradedFiles: this.upgradedFiles,
		};
	}
}
