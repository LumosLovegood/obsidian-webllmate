import {type WebLLMAdapter} from "../../types";
import WebExecutor from "../../utils/webViewer/WebExecutor";


export default abstract class BaseAdapter implements WebLLMAdapter {
	abstract name: string;
	abstract url: string;
	protected _executor: WebExecutor;

	async onLoad(): Promise<void> {
	}

	init(executor: WebExecutor) {
		this._executor = executor;
	}

	get executor() {
		if (!this._executor) {
			throw new Error("Executor: No executor init");
		}
		return this._executor;
	}

	abstract getCurrentReply(): Promise<string>;

	abstract chat(text: string): Promise<string>;

	abstract newChat(text: string): Promise<string>;

	abstract queryHistory(query: string): Promise<void>;
}
