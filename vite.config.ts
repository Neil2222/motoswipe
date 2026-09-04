import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for our own code; leave libraries alone.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// adapter-node: a plain `node build/index.js` server, which is what the
			// Docker image runs. No platform-specific adapter magic.
			adapter: adapter()
		})
	],
	server: {
		port: Number(process.env.PORT ?? 5173)
	}
});
