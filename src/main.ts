import {Plugin} from "obsidian";
import PluginUtils from "./utils/pluginUtils";
import WebLLM from "./WebLLM";

export default class WebLLMate extends Plugin {
	private webLLM: WebLLM;

	onload() {
		console.debug(`loading plugin "${this.manifest.name}" v${this.manifest.version}`);
		PluginUtils.bind(this);
		this.webLLM = new WebLLM();
	}

	onunload() {
		console.debug(`unloading plugin "${this.manifest.name}" v${this.manifest.version}`);
		this.webLLM?.onUnLoad();
		PluginUtils.onUnload();
	}
}
