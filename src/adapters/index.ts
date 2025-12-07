import Chatgpt from "./chatgpt";
import Kimi from "./kimi";
import Qwen from "./qwen";
import WebExecutor from "../utils/webViewer/WebExecutor";
import Yuanbao from "./yuanbao";
import {type WebLLMAdapter} from "../types";


export function loadAdapters(): WebLLMAdapter[] {
	const simpleAdapters = [Chatgpt, Kimi, Qwen, Yuanbao].map(
		Adapter => new Adapter()
	) as WebLLMAdapter[];

	const otherAdapters = [] as WebLLMAdapter[];

	return [...simpleAdapters, ...otherAdapters];
}


export function initAdapters(adapters: WebLLMAdapter[], executor: WebExecutor) {
	adapters.forEach(adapter => adapter.init(executor));
}
