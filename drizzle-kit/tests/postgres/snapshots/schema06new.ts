import { interval, pgEnum, pgSchema, pgTable } from 'drizzle-orm/pg-core';

enum Size {
	small = 'small',
	large = 'large',
}

enum Weight {
	light = 'light',
	heavy = 'heavy',
}

export const folder = pgSchema('folder');

export const color = folder.enum('color', ['red', 'green']);
export const size = folder.enum('size', Size);
export const cats = pgTable('cats', {
	color: color(),
	colors: color().array(),
	size: size(),
	sizes: size().array(),
});

export const coat = pgEnum('coat', ['short', 'long']);
export const weight = pgEnum('weight', Weight);
export const dogs = pgTable('dogs', {
	coat: coat(),
	coats: coat().array(),
	weight: weight(),
	weights: weight().array(),
});

export const mood = pgEnum('mood', ['calm', 'wild']);
export const folderMood = folder.enum('mood', ['calm', 'wild']);
export const birds = pgTable('birds', {
	moods: mood().array(),
	folderMoods: folderMood().array(),
});

export const period = folder.enum('interval', ['month', 'year']);
export const jobs = pgTable('jobs', {
	period: period(),
	timeout: interval(),
});
