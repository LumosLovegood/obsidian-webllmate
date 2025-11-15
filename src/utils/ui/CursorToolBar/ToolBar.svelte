<script lang="ts">
	import {scale} from 'svelte/transition';
	import {backOut, backIn, cubicOut} from 'svelte/easing';
	import {onDestroy, tick} from 'svelte';
	import Icon from "../components/Icon.svelte";
	import type {CursorTool} from "./index";

	export let cursorX: number = 0;
	export let cursorY: number = 0;
	export let visible: boolean = false;
	export let tools: CursorTool[] = [];

	let wrap: HTMLElement;
	let width = 0;
	let height = 0;

	let prevLeft = 0;
	let prevTop = 0;
	let isMoving = false;
	let animationFrame: number | null = null;

	$: if (visible && wrap) {
		tick().then(() => {
			width = wrap.offsetWidth;
			height = wrap.offsetHeight;
		});
	}

	$: targetLeft = width ? Math.round(cursorX - width / 3) : cursorX;
	$: targetTop = cursorY - 44;
	$: originX = width ? ((cursorX - targetLeft) / width) * 100 : 50;
	$: originY = height ? ((cursorY - targetTop) / height) * 100 : 0;

	$: if (width && visible) {
		targetLeft = Math.max(10, Math.min(window.innerWidth - width - 10, targetLeft));
		targetTop = Math.max(10, targetTop);
	}

	$: if (visible && (targetLeft !== prevLeft || targetTop !== prevTop)) {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}

		isMoving = true;
		const startTime = performance.now();
		const duration = 0; // 动画持续时间
		const startX = prevLeft || targetLeft;
		const startY = prevTop || targetTop;

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const easeProgress = cubicOut(progress);

			prevLeft = startX + (targetLeft - startX) * easeProgress;
			prevTop = startY + (targetTop - startY) * easeProgress;

			if (progress < 1) {
				animationFrame = requestAnimationFrame(animate);
			} else {
				prevLeft = targetLeft;
				prevTop = targetTop;
				isMoving = false;
			}
		};

		animationFrame = requestAnimationFrame(animate);
	}

	onDestroy(() => {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
	});

</script>

{#if visible}
	<div
		bind:this={wrap}
		class="cursor-toolbar"
		class:hover={true}
		style:left="{prevLeft}px"
		style:top="{prevTop}px"
		style:transform-origin="{originX}% {originY}%"
		in:scale={{ duration: 250, easing: backOut, start: 0.7 }}
		out:scale={{ duration: 200, easing: backIn, start: 0.7 }}
	>
		{#each tools as item}
			<Icon
				iconId={item.icon}
				tooltip={item.tooltip}
				enableHover={true}
				tooltipPos="top"
				on:click={() => item.callback(window.getSelection()?.toString())}
			/>
		{/each}
	</div>
{/if}

<style>
	.cursor-toolbar {
		position: absolute;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 2px 6px;
		border: 1px solid var(--background-modifier-border-hover);
		border-color: var(--background-modifier-border);
		/* 圆角 */
		border-radius: 10px;
		/* 背景 */
		background: var(--background-primary);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05), 0 4px 8px rgba(0, 0, 0, 0.1);
		transition: box-shadow 0.2s ease, border-color 0.2s ease;
	}

	.cursor-toolbar:hover {
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07),
		0 6px 12px rgba(0, 0, 0, 0.12);
		border-color: var(--background-modifier-border-focus);
	}
</style>
