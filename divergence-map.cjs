#!/usr/bin/env node
'use strict'
/* divergence-map.cjs - measures where the earlier estimator (pkg/crystal.js) and the
   correction candidate (corrections/crystal-fixed.js) disagree, offline.
   Prints JSON. Not a game capture and not an accuracy claim: this compares the
   two estimator implementations against each other. Run: node divergence-map.cjs [repo-root] */
const path = require('path')
const root = path.resolve(process.argv[2] || __dirname)
const prod = require(path.join(root, 'pkg/crystal.js'))
const corr = require(path.join(root, 'corrections/crystal-fixed.js'))

const GEARS = {
  duel_bp4:   { armor: 20, toughness: 12, blastEpf: 32, resist: 0, absorb: 0, totems: 0 },
  no_blast:   { armor: 20, toughness: 12, blastEpf: 0,  resist: 0, absorb: 0, totems: 0 },
  unarmored:  { armor: 0,  toughness: 0,  blastEpf: 0,  resist: 0, absorb: 0, totems: 0 }
}
const DIFF = 'HARD'
const results = { gears: {}, chains: [], meta: { difficulty: DIFF, exposure: 1 } }

for (const [gname, gear] of Object.entries(GEARS)) {
  const rows = []
  let maxAbs = 0, maxAbsAt = null, maxRel = 0, maxRelAt = null, geHalfHeart = 0, ge1pct = 0, relUndefined = 0
  const flips = {}
  for (let d = 0.5; d <= 12.0001; d += 0.25) {
    const a = prod.crystalHp(d, gear)
    const b = corr.crystalHp(d, gear)
    const abs = Math.abs(a - b)
    // rel is vs v75 as denominator; undefined when v75 === 0 (Infinity is NOT JSON-encodable: store null and count it)
    const rel = a === 0 ? null : Math.abs((a - b) / a)
    if (abs > maxAbs) { maxAbs = abs; maxAbsAt = +d.toFixed(2) }
    if (rel !== null && rel > maxRel) { maxRel = rel; maxRelAt = +d.toFixed(2) }
    if (abs >= 1.0) geHalfHeart++
    if (rel === null) relUndefined++
    else if (rel >= 0.01) ge1pct++
    rows.push({ d: +d.toFixed(2), v75: a, corr: b, abs, rel })
    for (const h of [20, 18, 16, 14, 12, 10, 8, 6, 4]) {
      const lethalA = a >= h, lethalB = b >= h
      if (lethalA !== lethalB) { flips[h] = flips[h] || []; flips[h].push(+d.toFixed(2)) }
    }
  }
  results.gears[gname] = { maxAbs, maxAbsAt, maxRelFinite: maxRel, maxRelFiniteAt: maxRelAt, relSemantics: 'abs(corr-v75)/v75 vs v75 denominator; null where v75===0 (corr>0 there, divergence unbounded)', pointsTotal: rows.length, pointsRelFinite: rows.length - relUndefined, pointsRelUndefined: relUndefined, distsGeHalfHeart: geHalfHeart, distsGe1pctFinite: ge1pct, lethalityFlips: flips, rows }
}

// Chain scenarios: v75 sums independent hits; corrected models the invulnerability gate.
const CHAINS = [
  [4.9, 5], [3, 5], [2, 3, 4], [7.2, 3.1, 9.9, 5.5], [1.5, 2, 2.5, 3], [6, 6], [2, 2]
]
for (const [gname, gear] of Object.entries(GEARS)) {
  for (const dists of CHAINS) {
    const v75 = dists.reduce((n, d) => n + prod.crystalHp(d, gear), 0)
    const c = corr.chainDamage(dists, gear)
    results.chains.push({ gear: gname, dists, v75Sum: v75, corrMin: c.min, corrMax: c.max,
      overestimateVsMax: v75 - c.max, overestimateVsMin: v75 - c.min })
  }
}

console.log(JSON.stringify(results, null, 1))
