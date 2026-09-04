import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import {
	deleteRound,
	duplicateRound,
	listRounds,
	setRoundStatus
} from '$lib/server/services/round.service';
import { countFavorites } from '$lib/server/services/favorite.service';
import { isDomainError } from '$lib/server/errors';
import { formError, type FormErrors } from '$lib/domain/validation';
import { prisma } from '$lib/server/db/client';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const includeArchived = event.url.searchParams.get('archived') === '1';

	const [rounds, manufacturers, catalogueSize, savedCount] = await Promise.all([
		listRounds(user.id, { includeArchived }),
		prisma.manufacturer.findMany({ select: { id: true, name: true } }),
		prisma.motorcycle.count({ where: { isActive: true } }),
		countFavorites(user.id)
	]);

	return {
		rounds,
		includeArchived,
		catalogueSize,
		savedCount,
		// Sent as an array because a Map is not serialisable across the
		// server/client boundary; the page rebuilds it.
		manufacturers
	};
};

export const actions: Actions = {
	duplicate: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const roundId = String(form.get('roundId') ?? '');
		const name = String(form.get('name') ?? '').trim();

		if (!name) {
			const errors: FormErrors = formError('Give the new round a name.');
			return fail(422, { errors });
		}

		try {
			const round = await duplicateRound(user.id, roundId, name.slice(0, 80));
			return { duplicatedId: round.id, duplicatedName: round.name };
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = formError(error.message);
				return fail(error.status, { errors });
			}
			throw error;
		}
	},

	archive: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const roundId = String(form.get('roundId') ?? '');

		try {
			await setRoundStatus(user.id, roundId, 'ARCHIVED');
			return { archived: true };
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = formError(error.message);
				return fail(error.status, { errors });
			}
			throw error;
		}
	},

	unarchive: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const roundId = String(form.get('roundId') ?? '');

		try {
			await setRoundStatus(user.id, roundId, 'ACTIVE');
			return { unarchived: true };
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = formError(error.message);
				return fail(error.status, { errors });
			}
			throw error;
		}
	},

	delete: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const roundId = String(form.get('roundId') ?? '');

		try {
			await deleteRound(user.id, roundId);
			return { deleted: true };
		} catch (error) {
			if (isDomainError(error)) {
				const errors: FormErrors = formError(error.message);
				return fail(error.status, { errors });
			}
			throw error;
		}
	}
};
