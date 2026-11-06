'use strict'
// Crystal logic (pure, no server). Vanilla explosion damage, power 6, exposure assumed 1 (no blocks/armor: conservative for self, optimistic for target).
const { LIMITS } = require('./legit'), { NONE, afterGear } = require('./gear')
const POWER = 6, HARD = 1.5   // assume Hard difficulty multiplier for the self-damage estimate (worst case)
// raw (ungeared) damage; use crystalHp for what a given player actually loses
function crystalDamage (dist, difficultyMul = HARD) {
  if (!(Number.isFinite(dist) && dist >= 0)) return Infinity
  const r = POWER * 2; if (dist >= r) return 0
  const impact = 1 - dist / r
  return Math.floor((impact * impact + impact) / 2 * 7 * POWER + 1) * difficultyMul
}
// self safety: a crystal action is allowed only if the estimated self damage leaves at least `keep` HP (tier value).
const crystalHp = (dist, gear = NONE) => afterGear(crystalDamage(dist), gear).hp
const safe = (selfDmg, health, keep) => Number.isFinite(health) && selfDmg < health - keep
// crystals: [{ id, pos:{x,y,z}, dist, los }] relative to the bot; me/foe: {x,y,z}; foeBody offset ~ +0.9 y
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
// A crystal explosion destroys every crystal within 12 blocks (they take damage, then explode): the whole connected group goes off.
// So the self-damage of any break/place is the SUM over the chain, not one crystal.
const CHAIN = POWER * 2
function chain (start, all) {
  const seen = [start]; let grew = true
  while (grew) { grew = false; for (const p of all) if (!seen.includes(p) && seen.some(q => d3(p, q) < CHAIN)) { seen.push(p); grew = true } }
  return seen
}
const sumHp = (ps, at, gear, k = 1) => k * ps.reduce((n, p) => n + crystalHp(d3(p, at), gear), 0)
// nearest-point distance from the eye to a crystal's 2x2x2 hitbox (x-1..x+1, y..y+2, z-1..z+1): what the server's attack reach check measures
function boxDist (eye, p) {
  const dx = Math.max(p.x - 1 - eye.x, 0, eye.x - (p.x + 1)), dy = Math.max(p.y - eye.y, 0, eye.y - (p.y + 2)), dz = Math.max(p.z - 1 - eye.z, 0, eye.z - (p.z + 1))
  return Math.hypot(dx, dy, dz)
}
// crystals: [{ id, pos, dist (eye->hitbox via boxDist), los }] ; all: positions of EVERY live crystal (default: crystals' positions)
function chooseBreak ({ crystals, all, me, foe, health, keep = 6, gear = NONE, foeGear = gear, k = 1 }) {
  const maxD = LIMITS.reachMelee - LIMITS.margin; let best = null
  const list = Array.isArray(crystals) ? crystals.filter(c => c && c.pos) : []
  const pos = Array.isArray(all) ? all : list.map(c => c.pos)
  for (const c of list) {
    if (c.los !== true || !(c.dist >= 0) || c.dist > maxD) continue
    const group = chain(c.pos, pos.includes(c.pos) ? pos : [c.pos, ...pos])
    const sd = sumHp(group, me, gear, k), td = sumHp(group, foe, foeGear, k)
    if (!safe(sd, health, keep) || td <= 0) continue
    const score = td - sd
    if (!best || score > best.score) best = { id: c.id, score, selfDmg: sd, foeDmg: td, dist: c.dist, chain: group.length, k }
  }
  return best
}
// bases: [{ pos (block), dist (eye->base top, place reach), breakDist (eye->hitbox of the crystal that would sit there), los, airAbove }]
// existing: positions of live crystals; maxCrystals: alive cap (tier). A base is only used if its crystal could be broken right away.
function choosePlace ({ bases, existing = [], maxCrystals = 1, me, foe, health, keep = 6, gear = NONE, foeGear = gear, k = 1 }) {
  const maxD = LIMITS.reachPlace - LIMITS.margin, maxB = LIMITS.reachMelee - LIMITS.margin; let best = null
  if (!(Number.isInteger(maxCrystals) && maxCrystals >= 1) || (Array.isArray(existing) ? existing : []).length >= maxCrystals) return null
  for (const b of Array.isArray(bases) ? bases : []) {
    if (!b || !b.pos || b.los !== true || b.airAbove !== true || !(b.dist >= 0) || b.dist > maxD) continue
    if (b.breakDist !== undefined && !(b.breakDist <= maxB)) continue
    const c = { x: b.pos.x + 0.5, y: b.pos.y + 1, z: b.pos.z + 0.5 }
    const group = chain(c, [c, ...existing])
    const sd = sumHp(group, me, gear, k), td = sumHp(group, foe, foeGear, k)
    if (!safe(sd, health, keep) || td <= 0) continue
    const score = td - sd
    if (!best || score > best.score) best = { pos: b.pos, score, selfDmg: sd, foeDmg: td, dist: b.dist, chain: group.length, k }
  }
  return best
}
module.exports = { boxDist, chain, crystalHp, crystalDamage, chooseBreak, choosePlace, safe }
