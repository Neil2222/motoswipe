/**
 * Toast notifications.
 *
 * A rune-backed module store rather than a Svelte context, so any module —
 * including a `use:enhance` callback that has no component instance — can raise
 * one without threading a prop through.
 */

export type ToastTone = 'info' | 'success' | 'error' | 'like' | 'superlike';

export interface Toast {
	id: number;
	message: string;
	tone: ToastTone;
	/** Optional action, e.g. "Undo". */
	action?: { label: string; run: () => void };
}

const DEFAULT_TTL = 3200;
/** Errors stay longer — you need time to read what went wrong. */
const ERROR_TTL = 6000;

let nextId = 1;

class ToastStore {
	items = $state<Toast[]>([]);

	push(message: string, tone: ToastTone = 'info', action?: Toast['action']): number {
		const id = nextId++;
		this.items.push({ id, message, tone, action });

		// Never let a burst of swipe toasts stack past the fold.
		if (this.items.length > 4) this.items.shift();

		const ttl = tone === 'error' ? ERROR_TTL : DEFAULT_TTL;
		setTimeout(() => this.dismiss(id), ttl);
		return id;
	}

	success(message: string, action?: Toast['action']) {
		return this.push(message, 'success', action);
	}
	error(message: string) {
		return this.push(message, 'error');
	}
	info(message: string, action?: Toast['action']) {
		return this.push(message, 'info', action);
	}

	dismiss(id: number): void {
		const index = this.items.findIndex((t) => t.id === id);
		if (index !== -1) this.items.splice(index, 1);
	}

	clear(): void {
		this.items = [];
	}
}

export const toasts = new ToastStore();
