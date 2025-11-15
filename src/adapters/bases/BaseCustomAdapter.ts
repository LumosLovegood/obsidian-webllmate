import {htmlToMarkdown} from "obsidian";
import PluginUtils from "../../utils/pluginUtils";
import BaseAdapter from "./BaseAdapter";
import {Timeout} from "../../utils/common";

export default abstract class BaseCustomAdapter extends BaseAdapter {
	abstract name: string;
	abstract url: string;
	protected abstract finished: Promise<boolean>;
	protected abstract result: Promise<string>;

	@Timeout(5 * 60_000)
	async chat(text: string): Promise<string> {
		const WAIT_SEND_TIME = 500;
		await this.inputChat(text);
		await this.executor.sleep(WAIT_SEND_TIME);
		await this.send();
		const result = await this.waitChatResult();
		return htmlToMarkdown(result).replace(/\n+?\s*\n/g, "\n");
	}

	async newChat(text: string): Promise<string> {
		const WAIT_CHAT = 500;
		await this.new();
		await this.executor.sleep(WAIT_CHAT);
		return this.chat(text);
	}

	async queryHistory(query?: string): Promise<void> {
		const WANT_INPUT = 500;
		await this.showHistory();
		if (!query) {
			return;
		}
		await this.executor.sleep(WANT_INPUT);
		await this.inputHistory(query);
	}

	async getCurrentReply() {
		return this.result;
	}

	private async waitChatResult() {
		const CHECK_FINISH_INTERVAL = 200;
		return new Promise<string>((resolve, reject) => {
			const timer = window.setInterval(async () => {
				if (!await this.finished) {
					return;
				}
				clearInterval(timer);
				resolve(await this.result);
			}, CHECK_FINISH_INTERVAL);
			PluginUtils.plugin.registerInterval(timer);
		});
	}

	protected abstract showHistory(): Promise<void>;

	protected abstract inputHistory(text: string): Promise<void>;

	protected abstract inputChat(text: string): Promise<void>;

	protected abstract send(): Promise<void>;

	protected abstract new(): Promise<void>;
}
