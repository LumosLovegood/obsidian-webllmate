import {type WebLLMAdapter} from "../../types";
// @ts-ignore
import WebExecutor from "../../utils/webViewer/WebExecutor";


export default abstract class BaseAdapter implements WebLLMAdapter {
	abstract name: string;
	abstract url: string;

	constructor(readonly executor: WebExecutor) {
	}

	async onLoad(): Promise<void> {
	}

	abstract getCurrentReply(): Promise<string>;

	abstract chat(text: string): Promise<string>;

	abstract newChat(text: string): Promise<string>;

	abstract queryHistory(query: string): Promise<void>;
}
