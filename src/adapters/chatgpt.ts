import BaseGeneralAdapter, {type WebLLMAdapterConfig } from "./bases/BaseGeneralAdapter";

export default class Chatgpt extends BaseGeneralAdapter {
	name = "ChatGPT";
	url = "https://chatgpt.com/";
	protected config: WebLLMAdapterConfig = {
		chat: {
			new: 'a[aria-label="新聊天"]',
			send: "#composer-submit-button",
			input: {
				target: ".ProseMirror>p",
				type: "contenteditable"
			}
		},
		reply: {
			filter: "article[data-turn='assistant']",
			finishFlag: "button[data-testid='copy-turn-action-button']",
			content: ".markdown"
		},
		history: {
			show: 'a[data-testid="create-new-chat-button"]+div',
			input: {
				target: 'input[placeholder="搜索聊天…"]',
				type: "controlled"
			}
		}
	};

	protected showHistory(): this {
		this.executor
			.click('button[data-testid="open-sidebar-button"]')
			.delay(500);
		return super.showHistory();
	}
}
