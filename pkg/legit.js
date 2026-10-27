'use strict'
const LIMITS = Object.freeze({ reachMelee: 3.0, reachPlace: 4.5, margin: 0.25, reactionFloorMs: 150, aimDegPerTick: 40 })
const num = (...v) => v.every(x => typeof x === 'number' && Number.isFinite(x))
// action: { kind:'melee'|'break'|'place', dist, los:boolean, reactionMs, aimDeg }. Returns violations (empty = legit). Anything malformed is a violation (fail closed).
function check (a, L = LIMITS) {
  const v = []
  if (!a || typeof a !== 'object' || !['melee','break','place'].includes(a.kind) || !num(a.dist, a.reactionMs, a.aimDeg) || typeof a.los !== 'boolean') return ['malformed action']
  const max = (a.kind === 'place' ? L.reachPlace : L.reachMelee) - L.margin
  if (a.dist < 0 || a.dist > max) v.push('reach ' + a.dist + ' > ' + max)
  if (!a.los) v.push('no line of sight')
  if (a.reactionMs < L.reactionFloorMs) v.push('reaction ' + a.reactionMs + ' ms < ' + L.reactionFloorMs)
  if (Math.abs(a.aimDeg) > L.aimDegPerTick) v.push('aim ' + a.aimDeg + ' deg/tick > ' + L.aimDegPerTick)
  return v
}
// log-normal reaction sample (median 190 ms, floored at the limit)
function reaction (rnd = Math.random, L = LIMITS, median = 190, sigma = 0.25) { const u = Math.max(rnd(), 1e-9), w = rnd(), z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); return Math.max(L.reactionFloorMs, Math.round(median * Math.exp(sigma * z))) }
module.exports = { LIMITS, check, reaction }
