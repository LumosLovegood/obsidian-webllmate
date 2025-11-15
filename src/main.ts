import {Plugin} from "obsidian";
import {log, logging} from "./libs/logging";
import PluginUtils from "./utils/pluginUtils";
import WebLLM from "./WebLLM";

export default class WebLLMate extends Plugin {
	private webLLM: WebLLM;

	async onload() {
		logging.registerConsoleLogger();
		log(
			"info",
			`loading plugin "${this.manifest.name}" v${this.manifest.version}`
		);
		PluginUtils.bind(this);
		this.webLLM = new WebLLM();
	}

	async onunload() {
		log(
			"info",
			`unloading plugin "${this.manifest.name}" v${this.manifest.version}`
		);
		this.webLLM.onUnLoad();
		PluginUtils.onUnload();
	}
}
