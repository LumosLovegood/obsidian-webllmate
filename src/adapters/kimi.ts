import BaseGeneralAdapter, {type WebLLMAdapterConfig } from "./bases/BaseGeneralAdapter";

export default class Kimi extends BaseGeneralAdapter {
	name = "KIMI";
	url = "https://www.kimi.com";
	protected config: WebLLMAdapterConfig = {
		chat: {
			new: ".new-chat-btn",
			send: ".send-button",
			input: {
				target: ".chat-input-editor",
				type: "lexical"
			}
		},
		history: {
			show: "a.more-history",
			input: {
				target: "input[placeholder='搜索历史会话']",
				type: "normal"
			}
		},
		reply: {
			filter: ".segment-assistant",
			finishFlag: "svg[name='Refresh']",
			content: ".markdown",
		}
	};

	async onLoad(): Promise<void> {
		await this.executor
			.delay(600)
			.remove(".header-center")
			.remove(".show-case-container")
			.done()
		;
	}
}
