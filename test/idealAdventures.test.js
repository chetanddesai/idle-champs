/**
 * test/idealAdventures.test.js — verifies the static favor → ideal-adventure
 * mapping. Pins each entry the user provided so a future edit to the map
 * can't silently drop or reorder a campaign without the test catching it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { idealAdventureForFavor } from '../js/lib/idealAdventures.js';

test('idealAdventureForFavor — Grand Tour (id 1) → Beast Intentions', () => {
  assert.equal(idealAdventureForFavor(1), 'Beast Intentions');
});

test('idealAdventureForFavor — Tomb of Annihilation (id 3) → The Ring of Regeneration', () => {
  assert.equal(idealAdventureForFavor(3), 'The Ring of Regeneration');
});

test('idealAdventureForFavor — Dragon Heist / Waterdeep (id 15) → A Mysterious Summons', () => {
  assert.equal(idealAdventureForFavor(15), 'A Mysterious Summons');
});

test('idealAdventureForFavor — Descent into Avernus (id 22) → The Dead Three', () => {
  assert.equal(idealAdventureForFavor(22), 'The Dead Three');
});

test('idealAdventureForFavor — Rime of the Frostmaiden (id 23) → The Everlasting Rime', () => {
  assert.equal(idealAdventureForFavor(23), 'The Everlasting Rime');
});

test('idealAdventureForFavor — Witchlight (id 25) → The Witchlight Carnival', () => {
  assert.equal(idealAdventureForFavor(25), 'The Witchlight Carnival');
});

test('idealAdventureForFavor — Xaryxis (id 30) → The Evacuation of Waterdeep', () => {
  assert.equal(idealAdventureForFavor(30), 'The Evacuation of Waterdeep');
});

test("idealAdventureForFavor — Fortune's Wheel (id 31) → Lost Modron or Fast Food", () => {
  assert.equal(idealAdventureForFavor(31), 'Lost Modron or Fast Food');
});

test('idealAdventureForFavor — Vecna (id 35) → Tale of Two Vecnas', () => {
  assert.equal(idealAdventureForFavor(35), 'Tale of Two Vecnas');
});

test('idealAdventureForFavor — accepts string ids', () => {
  assert.equal(idealAdventureForFavor('1'), 'Beast Intentions');
  assert.equal(idealAdventureForFavor('25'), 'The Witchlight Carnival');
});

test('idealAdventureForFavor — unmapped favors return null', () => {
  // Highharvestide (id 2), Liar's Night (id 4), seasonal favors etc.
  // have no community-consensus best adventure for forge runs.
  assert.equal(idealAdventureForFavor(2), null);
  assert.equal(idealAdventureForFavor(4), null);
  assert.equal(idealAdventureForFavor(36), null); // Tales of the Champions
});

test('idealAdventureForFavor — null / undefined / NaN return null', () => {
  assert.equal(idealAdventureForFavor(null), null);
  assert.equal(idealAdventureForFavor(undefined), null);
  assert.equal(idealAdventureForFavor(NaN), null);
  assert.equal(idealAdventureForFavor('not-a-number'), null);
});
