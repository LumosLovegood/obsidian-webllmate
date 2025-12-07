import BaseGeneralAdapter, {
	type WebLLMAdapterConfig
} from "./bases/BaseGeneralAdapter";

export default class Yuanbao extends BaseGeneralAdapter {
	name = "Yuanbao";
	url = "https://yuanbao.tencent.com/chat";

	protected config: WebLLMAdapterConfig = {
		chat: {
			new: "[data-desc='new-chat']",
			input: {
				target: ".ql-editor>p",
				type: "contenteditable"
			},
			send: "#yuanbao-send-btn"
		},
		history: {
			show: "[dt-button-id='search_bar']",
			input: {
				target: 'input[placeholder="搜索对话"]',
				type: "controlled"
			}
		},
		reply: {
			filter: 'div[data-conv-speaker="ai"]',
			finishFlag: ".agent-chat__toolbar__copy__icon",
			content: ".hyc-common-markdown"
		}
	}

	async onLoad(): Promise<void> {
		await this.executor
			.delay(600)
			.remove("div[class^='index_downloadPC']")
			.remove("div.agent-dialogue__tool")
			.remove(".input-guide-v2")
			.done<void>();
	}
}
