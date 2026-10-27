'use strict'
// Gear model for explosion damage. Pure. Vanilla order: armor -> resistance -> enchant protection -> absorption.
// Unknown/unreadable gear = NO armor (worst case), so the bot stays cautious instead of over-confident.
const { normalizeEnchants } = require('./enchants')
const MAT = { netherite: { a: [3, 8, 6, 3], t: 3 }, diamond: { a: [3, 8, 6, 3], t: 2 }, iron: { a: [2, 6, 5, 2], t: 0 }, golden: { a: [2, 5, 3, 1], t: 0 }, chainmail: { a: [2, 5, 4, 1], t: 0 }, leather: { a: [1, 3, 2, 1], t: 0 }, turtle: { a: [2, 0, 0, 0], t: 0 } }
const SLOT = { helmet: 0, chestplate: 1, leggings: 2, boots: 3 }
const NONE = Object.freeze({ armor: 0, toughness: 0, blastEpf: 0, resist: 0, absorb: 0, totems: 0 })
// items: [{ name, enchants?: [{name, lvl}] }] (armor pieces; extra/odd entries ignored). Returns gear.
function parseGear (items, { resist = 0, absorb = 0, totems = 0, registry } = {}) {
  const g = { armor: 0, toughness: 0, blastEpf: 0, resist: Math.min(4, Math.max(0, resist | 0)), absorb: Math.max(0, Number(absorb) || 0), totems: Math.max(0, totems | 0) }
  const seen = new Set()
  for (const it of Array.isArray(items) ? items : []) {
    const m = it && typeof it.name === 'string' && it.name.match(/^(netherite|diamond|iron|golden|chainmail|leather|turtle)_(helmet|chestplate|leggings|boots)$/) || (it && it.name === 'turtle_helmet' ? ['', 'turtle', 'helmet'] : null)
    if (!m || seen.has(m[2])) continue; seen.add(m[2])
    const mat = MAT[m[1]]; g.armor += mat.a[SLOT[m[2]]]; g.toughness += mat.t
    for (const e of normalizeEnchants(it, registry)) {
      if (e && e.name === 'blast_protection') g.blastEpf += 2 * (e.lvl | 0)
      else if (e && e.name === 'protection') g.blastEpf += (e.lvl | 0)
    }
  }
  g.toughness = g.toughness; return g
}
// raw damage (already difficulty-scaled) -> damage taken after armor, resistance, enchants, absorption: { hp, absorbUsed }
function afterGear (raw, g = NONE) {
  if (!(Number.isFinite(raw) && raw >= 0)) return { hp: Infinity, absorbUsed: 0 }
  let d = raw * (1 - Math.min(20, Math.max(g.armor / 5, g.armor - raw / (2 + g.toughness / 4))) / 25)
  d *= 1 - 0.2 * g.resist
  d *= 1 - Math.min(20, g.blastEpf) / 25
  const absorbUsed = Math.min(g.absorb, d)
  return { hp: d - absorbUsed, absorbUsed }
}
module.exports = { NONE, parseGear, afterGear }
