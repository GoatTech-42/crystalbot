// Offline numerical estimator for Minecraft 26.2. Runtime compatibility is not established.
'use strict'
const f = Math.fround

function rawExplosionDamage (dist, { exposure = 1, radius = 6 } = {}) {
  if (!(Number.isFinite(dist) && dist >= 0)) return Infinity
  const diameter = f(f(radius) * f(2))
  const d6 = dist / diameter
  if (d6 > 1) return null
  const i = (1 - d6) * f(exposure)
  return f(((i * i + i) / 2) * 7 * diameter + 1)
}

function applyDifficulty (d, difficulty = 'HARD') {
  if (d === null) return null
  switch (difficulty) {
    case 'PEACEFUL': return f(0)
    case 'EASY': return Math.min(f(f(f(d) / f(2)) + f(1)), f(d))
    case 'HARD': return f(f(f(d) * f(3)) / f(2))
    case 'NORMAL': return f(d)
    default: throw new Error('bad difficulty ' + difficulty)
  }
}

function afterArmor (d, armor, toughness) {
  if (d === null) return null
  const fa = f(armor), ft = f(toughness)
  const div = f(f(2) + f(ft / f(4)))
  const x = Math.min(f(20), Math.max(f(fa * f(0.2)), f(fa - f(f(d) / div))))
  const red = f(x / f(25))
  return f(f(d) * f(f(1) - red))
}

function afterMagic (d, epf, resist = 0) {
  if (d === null) return null
  if (resist !== 0) throw new Error('resistance path not modeled (out of capture scope)')
  const p = Math.min(f(20), Math.max(f(0), f(epf)))
  return f(f(d) * f(f(1) - f(p / f(25))))
}

function applyAbsorption (d, absorb) {
  if (d === null) return { hp: null, absorbUsed: 0 }
  const f4 = f(d), a = f(absorb)
  const out = Math.max(f(0), f(f4 - a))
  return { hp: out, absorbUsed: f(a - f(f4 - out)) }
}

class ChainState {
  constructor () { this.invulnerableTime = 0; this.lastHurt = 0 }
  gate (dPre, ticks) {
    this.invulnerableTime = Math.max(0, this.invulnerableTime - Math.max(0, ticks | 0))
    if (f(this.invulnerableTime) > f(10)) {
      if (!(dPre > this.lastHurt)) return null
      const eff = f(f(dPre) - this.lastHurt); this.lastHurt = f(dPre); return eff
    }
    this.lastHurt = f(dPre); this.invulnerableTime = 20; return f(dPre)
  }
}

function singleHit (dist, gear, { exposure = 1, difficulty = 'HARD' } = {}) {
  const raw = rawExplosionDamage(dist, { exposure })
  const pre = applyDifficulty(raw, difficulty)
  if (pre === null) return { raw, preArmor: null, gated: null, hp: 0 }
  const post = afterMagic(afterArmor(pre, gear.armor, gear.toughness), gear.blastEpf)
  const { hp } = applyAbsorption(post, gear.absorb || 0)
  return { raw, preArmor: pre, gated: pre, hp }
}
function chainHits (dets, gear, { exposure = 1, difficulty = 'HARD', health = 20 } = {}) {
  const st = new ChainState(); let h = f(health), absorb = f(gear.absorb || 0); const hits = []
  for (const det of dets) {
    const raw = rawExplosionDamage(det.dist, { exposure })
    const pre = applyDifficulty(raw, difficulty)
    if (pre === null) { hits.push({ dist: det.dist, raw, preArmor: null, gated: null, hp: 0, healthAfter: h }); continue }
    const gated = st.gate(pre, det.ticks || 0)
    if (gated === null) { hits.push({ dist: det.dist, raw, preArmor: pre, gated: null, hp: 0, healthAfter: h }); continue }
    const post = afterMagic(afterArmor(gated, gear.armor, gear.toughness), gear.blastEpf)
    const a = applyAbsorption(post, absorb); absorb = f(absorb - a.absorbUsed)
    h = f(h - a.hp)
    hits.push({ dist: det.dist, raw, preArmor: pre, gated, hp: a.hp, healthAfter: h })
  }
  return { totalHp: f(f(health) - h), healthAfter: h, hits }
}
module.exports = { f, rawExplosionDamage, applyDifficulty, afterArmor, afterMagic, applyAbsorption, ChainState, singleHit, chainHits }
