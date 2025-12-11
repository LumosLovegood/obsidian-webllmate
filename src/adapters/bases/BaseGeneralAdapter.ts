import {htmlToMarkdown} from "obsidian";
import BaseAdapter from "./BaseAdapter";
import {type InputType} from "../../utils/webViewer/WebExecutor";
import {Timeout} from "../../utils/common";

interface InputOptions {
	target: string;
	type?: InputType;
}


export interface WebLLMAdapterConfig {
	chat: {
		new: string;
		input: InputOptions;
		send: string;
	},
	history: {
		show: string;
		input?: InputOptions;
	};
	reply: {
		filter: string;
		finishFlag: string;
		content: string;
	};
	upload?: {
		image: string;
	}
}

export default abstract class BaseGeneralAdapter extends BaseAdapter {
	abstract name: string;
	abstract url: string;

	protected abstract config: WebLLMAdapterConfig;

	@Timeout(5 * 60_000)
	async chat(text: string): Promise<string> {
		return this
			.sendText(text)
			.waitReply()
			.getCurrentReply();
	}

	async newChat(text: string): Promise<string> {
		return this
			.new()
			.chat(text);
	}

	async queryHistory(query?: string): Promise<void> {
		const DELAY_INPUT = 500;
		this.showHistory();
		if (!query || !this.config.history.input) {
			return;
		}
		this.executor
			.delay(DELAY_INPUT)
			.input(this.config.history.input.target, query, this.config.history.input.type);
		return this.executor.done();
	}

	async getCurrentReply() {
		const reply = await this.executor
			.waitFor(this.config.reply.filter)
			.queryAll(this.config.reply.filter, true).at(-1)
			.query(this.config.reply.content).html()
			.done();
		return htmlToMarkdown(reply);
	}

	protected showHistory() {
		this.executor
			.click(this.config.history.show);
		return this;
	}

	protected new() {
		this.executor
			.click(this.config.chat.new)
			.delay(500);
		return this;
	}

	protected sendText(text: string) {
		const DELAY_SEND = 500;
		this.executor
			.input(this.config.chat.input.target, text, this.config.chat.input.type)
			.delay(DELAY_SEND)
			.click(this.config.chat.send)
			.delay(1000);
		return this;
	}

	protected waitReply() {
		const WAIT_CHECK_TIMEOUT = 200_000;
		const WAIT_CHECK_INTERVAL = 500;
		this.executor
			.queryAll(this.config.reply.filter).at(-1)
			.waitFor(this.config.reply.finishFlag, WAIT_CHECK_TIMEOUT, WAIT_CHECK_INTERVAL);
		return this;
	}
}
