import BaseGeneralAdapter, {type WebLLMAdapterConfig } from "./bases/BaseGeneralAdapter";

export default class Qwen extends BaseGeneralAdapter {
	name = "qwen";
	url = "https://www.qianwen.com/";

    protected config: WebLLMAdapterConfig = {
		chat: {
			new: 'span[data-icon-type="pcicon-addDialogue-line"]',
			send: 'span:has( use[*|href="#pcicon-sendingBold-line"])',
			input: {
				target: 'textarea[placeholder="向千问提问"]',
				type: "textarea"
			}
		},
		history: {
			show: 'span[data-icon-type="pcicon-kongzhi-control-line"]',
			input: {
				target: 'input[placeholder="搜索历史记录"]',
				type: "controlled"
			}
		},
		reply: {
			filter: "div[class^='answerItem']",
			finishFlag: "span[data-icon-type='pcicon-upvote-line']",
			content: ".tongyi-markdown"
		}
	};

	protected showHistory(): this {
		this.executor
			.click("span[data-icon-type='pcicon-operateRight-line']")
			.delay(500);
		return super.showHistory();
	}
}
