import {type App, Modal} from "obsidian";


export class ConfirmModal extends Modal {
	private resolvePromise: (confirm: boolean) => void;
	private rejectPromise: (reason: string) => void;
	public promise: Promise<any>;

	constructor(
		readonly app: App,
		private readonly title: string,
		private readonly content: string,
	) {
		super(app);
		this.promise = new Promise<any>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});
		this.open();
	}

	onOpen() {
		const {titleEl, modalEl, contentEl} = this;
		titleEl.setText(this.title);
		contentEl.setText(this.content);
		modalEl.createDiv({cls: "modal-button-container"}, (div) => {
			div.createEl("button", {cls: "mod-cta", text: "是"}, (el) =>
				el.onClickEvent(() => {
					this.resolvePromise(true);
					this.close();
				})
			);
			div.createEl("button", {text: "否"}, (el) => el.onClickEvent(() => this.close()));
		});
	}

	onClose() {
		this.contentEl.empty();
		this.resolvePromise(false);
	}
}
