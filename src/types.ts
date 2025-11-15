export interface LLM{
	chat(text: string): Promise<string>;
}

export interface WebLLMAdapter extends LLM {
	name: string;
	url: string;
	onLoad(): Promise<void>;
	newChat(text: string): Promise<string>;
	getCurrentReply(): Promise<string>;
	queryHistory(query?: string): Promise<void>;
}

