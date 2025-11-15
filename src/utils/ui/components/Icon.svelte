<script lang="ts">
	import {onDestroy, createEventDispatcher} from "svelte";
	import {setIcon} from "obsidian";

	export let iconId: string;
	export let tooltip: string | undefined = undefined;
	export let tooltipPos: "left" | "right" | "top" | "bottom" = "bottom";
	export let enableHover: boolean = false;

	const dispatch = createEventDispatcher();
	let el: HTMLElement;

	$: if (el && iconId) {
		setIcon(el, iconId);
	}

	onDestroy(() => el?.empty())
</script>

<button
	bind:this={el}
	aria-label={tooltip}
	data-tooltip-position={tooltipPos}
	on:click={() => dispatch("click", {iconId, tooltip})}
	class="icon"
	class:allow-hover={enableHover}
>
</button>


<style>
	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-normal);
		background: transparent;
		padding: 2px;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	button.allow-hover:hover {
		background-color: var(--background-modifier-hover);
	}
</style>

