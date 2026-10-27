// Offline numerical estimator for Minecraft 26.2. Runtime compatibility is not established.
'use strict'
const v = require('./vanilla26_2')
const { NONE, parseGear } = require('../pkg/gear')
const { LIMITS } = require('../pkg/legit')

function crystalDamage (dist, difficulty = 'HARD', exposure = 1) {
  const pre = v.applyDifficulty(v.rawExplosionDamage(dist, { exposure }), difficulty)
  return pre === null ? 0 : pre
}
function crystalHp (dist, gear = NONE, difficulty = 'HARD', exposure = 1) {
  return v.singleHit(dist, gear, { exposure, difficulty }).hp
}
function chainDamage (dists, gear = NONE, difficulty = 'HARD', exposure = 1, health = 20) {
  const ds = (Array.isArray(dists) ? dists : []).filter(d => Number.isFinite(d) && d >= 0 && d <= 12)
  if (ds.length === 0) return { min: 0, max: 0, hits: [] }
  const pre = d => v.applyDifficulty(v.rawExplosionDamage(d, { exposure }), difficulty)
  const nearFirst = [...ds].sort((a, b) => pre(b) - pre(a))
  const farFirst = [...ds].sort((a, b) => pre(a) - pre(b))
  const run = order => v.chainHits(order.map(dist => ({ dist, ticks: 0 })), gear, { exposure, difficulty, health })
  const hi = run(nearFirst), lo = run(farFirst)
  return { min: lo.totalHp, max: hi.totalHp, hits: hi.hits }
}
function sumHp (ps, at, gear, k = 1, side = 'self', difficulty = 'HARD') {
  const dists = ps.map(p => d3(p, at))
  const c = chainDamage(dists, gear, difficulty)
  return k * (side === 'foe' ? c.min : c.max)
}
const safe = (selfDmg, health, keep) => Number.isFinite(health) && selfDmg < health - keep
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const CHAIN = 12
function chain (start, all) {
  const seen = [start]; let grew = true
  while (grew) { grew = false; for (const p of all) if (!seen.includes(p) && seen.some(q => d3(p, q) < CHAIN)) { seen.push(p); grew = true } }
  return seen
}
function boxDist (eye, p) {
  const dx = Math.max(p.x - 1 - eye.x, 0, eye.x - (p.x + 1)), dy = Math.max(p.y - eye.y, 0, eye.y - (p.y + 2)), dz = Math.max(p.z - 1 - eye.z, 0, eye.z - (p.z + 1))
  return Math.hypot(dx, dy, dz)
}
function chooseBreak ({ crystals, all, me, foe, health, keep = 6, gear = NONE, foeGear = gear, k = 1 }) {
  const maxD = LIMITS.reachMelee - LIMITS.margin; let best = null
  const list = Array.isArray(crystals) ? crystals.filter(c => c && c.pos) : []
  const pos = Array.isArray(all) ? all : list.map(c => c.pos)
  for (const c of list) {
    if (c.los !== true || !(c.dist >= 0) || c.dist > maxD) continue
    const group = chain(c.pos, pos.includes(c.pos) ? pos : [c.pos, ...pos])
    const sd = sumHp(group, me, gear, k, 'self'), td = sumHp(group, foe, foeGear, k, 'foe')
    if (!safe(sd, health, keep) || td <= 0) continue
    const score = td - sd
    if (!best || score > best.score) best = { id: c.id, score, selfDmg: sd, foeDmg: td, dist: c.dist, chain: group.length, k }
  }
  return best
}
function choosePlace ({ bases, existing = [], maxCrystals = 1, me, foe, health, keep = 6, gear = NONE, foeGear = gear, k = 1 }) {
  const maxD = LIMITS.reachPlace - LIMITS.margin, maxB = LIMITS.reachMelee - LIMITS.margin; let best = null
  if (!(Number.isInteger(maxCrystals) && maxCrystals >= 1) || (Array.isArray(existing) ? existing : []).length >= maxCrystals) return null
  for (const b of Array.isArray(bases) ? bases : []) {
    if (!b || !b.pos || b.los !== true || b.airAbove !== true || !(b.dist >= 0) || b.dist > maxD) continue
    if (b.breakDist !== undefined && !(b.breakDist <= maxB)) continue
    const c = { x: b.pos.x + 0.5, y: b.pos.y + 1, z: b.pos.z + 0.5 }
    const group = chain(c, [c, ...existing])
    const sd = sumHp(group, me, gear, k, 'self'), td = sumHp(group, foe, foeGear, k, 'foe')
    if (!safe(sd, health, keep) || td <= 0) continue
    const score = td - sd
    if (!best || score > best.score) best = { pos: b.pos, score, selfDmg: sd, foeDmg: td, dist: b.dist, chain: group.length, k }
  }
  return best
}
module.exports = { boxDist, chain, crystalDamage, crystalHp, chainDamage, sumHp, chooseBreak, choosePlace, safe, parseGear, NONE }
