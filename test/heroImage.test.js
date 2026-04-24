import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  heroPortraitUrl,
  hasHeroImages,
  heroMonogram,
} from '../js/lib/heroImage.js';

const SAMPLE_MAP = {
  source: 'https://github.com/Emmotes/ic_wiki',
  attribution: 'Hero portraits © Emmote (@Emmotes), MIT licensed.',
  base_url: 'https://emmotes.github.io/ic_wiki/images',
  portrait_path: 'portraits/portrait.png',
  heroes: {
    1: 'bruenor',
    2: 'celeste',
    55: 'morgaen',
  },
};

test('heroPortraitUrl — composes base_url, slug, portrait_path', () => {
  assert.equal(
    heroPortraitUrl(1, SAMPLE_MAP),
    'https://emmotes.github.io/ic_wiki/images/bruenor/portraits/portrait.png'
  );
});

test('heroPortraitUrl — accepts string or numeric hero ids', () => {
  assert.equal(
    heroPortraitUrl('55', SAMPLE_MAP),
    heroPortraitUrl(55, SAMPLE_MAP)
  );
});

test('heroPortraitUrl — returns null for unmapped hero id', () => {
  assert.equal(heroPortraitUrl(9999, SAMPLE_MAP), null);
});

test('heroPortraitUrl — returns null when map is missing or malformed', () => {
  assert.equal(heroPortraitUrl(1, null), null);
  assert.equal(heroPortraitUrl(1, {}), null);
  assert.equal(heroPortraitUrl(1, { base_url: 'x' }), null); // partial
  assert.equal(heroPortraitUrl(1, { base_url: 'x', portrait_path: 'y' }), null);
  assert.equal(heroPortraitUrl(1, 'not-an-object'), null);
});

test('heroPortraitUrl — returns null when slug is non-string', () => {
  const bad = { ...SAMPLE_MAP, heroes: { 1: 123 } };
  assert.equal(heroPortraitUrl(1, bad), null);
});

test('hasHeroImages — true for populated map, false otherwise', () => {
  assert.equal(hasHeroImages(SAMPLE_MAP), true);
  assert.equal(hasHeroImages(null), false);
  assert.equal(hasHeroImages({}), false);
  assert.equal(hasHeroImages({ ...SAMPLE_MAP, heroes: {} }), false);
});

test('heroMonogram — initials of first two words when multi-word', () => {
  assert.equal(heroMonogram('Black Viper'), 'BV');
  assert.equal(heroMonogram('Cazrin Snaketongue'), 'CS');
  assert.equal(heroMonogram('The Dark Urge'), 'TD');
});

test('heroMonogram — first two letters when single word', () => {
  assert.equal(heroMonogram('Bruenor'), 'BR');
  assert.equal(heroMonogram('K'), 'K');
});

test('heroMonogram — empty input yields empty string', () => {
  assert.equal(heroMonogram(''), '');
  assert.equal(heroMonogram('   '), '');
  assert.equal(heroMonogram(null), '');
  assert.equal(heroMonogram(undefined), '');
});
