#!/usr/bin/env node
'use strict'
/* gate-map-place-fixtures.cjs - deterministic checks for gate-map-place.cjs.
   Prints "gate-map-place-fixtures: N pass, M fail". */
const { execFileSync } = require('child_process')
const path = require('path')
const root = path.resolve(__dirname)
const prod = require(path.join(root, 'pkg/crystal.js'))
const corr = require(path.join(root, 'corrections/crystal-fixed.js'))

let pass = 0, fail = 0
const t = (name, cond) => { if (cond) { pass++ } else { fail++; console.log('FAIL', name) } }

const BP4 = { armor: 20, toughness: 12, blastEpf: 32, resist: 0, absorb: 0, totems: 0 }

// P1: hand-computed direction-A PLACE case, duel_bp4, h=20, k=1, keep=6.
// Base pos (-0.5, 2, -0.5) -> would-be crystal exactly (0,3,0), dSelf = 3.0 exactly.
// v75 linear model: 4.50 HP -> permits; corrected exact bound: 14.14 HP -> refuses.
// Damage/gate values only: this is not an assertion that the position is duel-reachable in play.
const me = { x: 0, y: 0, z: 0 }, foe = { x: 0, y: 3, z: 1 }
const base = { pos: { x: -0.5, y: 2, z: -0.5 }, dist: 1.38, breakDist: 1.38, los: true, airAbove: true }
const sd75 = prod.crystalHp(3.0, BP4), sdC = corr.chainDamage([3.0], BP4)
t('P1a v75 estimate at d=3 bp4 matches hand calc (4.50)', Math.abs(sd75 - 4.5022) < 0.01)
t('P1b corrected exact bound at d=3 bp4 matches hand calc (14.14)', Math.abs(sdC.max - 14.1437) < 0.01)
const args1 = { bases: [base], existing: [], maxCrystals: 1, me, foe, health: 20, keep: 6, gear: BP4, k: 1 }
const a1 = prod.choosePlace(args1), b1 = corr.choosePlace(args1)
t('P1c direction A: v75 choosePlace returns an action, corrected returns null', a1 !== null && b1 === null)

// P2: strict boundary - sd exactly health-keep refuses under both models' shared safe().
t('P2a boundary refuses', prod.safe(14, 20, 6) === false && corr.safe(14, 20, 6) === false)
t('P2b just-under permits', prod.safe(13.999, 20, 6) === true && corr.safe(13.999, 20, 6) === true)
t('P2c non-finite health refuses both', prod.safe(1, NaN, 6) === false && corr.safe(1, NaN, 6) === false)

// P3: k monotonicity on the place gate (sd scales, threshold fixed).
for (const h of [20, 16, 12]) {
  for (const [kLo, kHi] of [[1, 2], [2, 3]]) {
    const aLo = prod.choosePlace({ ...args1, health: h, k: kLo }), aHi = prod.choosePlace({ ...args1, health: h, k: kHi })
    const bLo = corr.choosePlace({ ...args1, health: h, k: kLo }), bHi = corr.choosePlace({ ...args1, health: h, k: kHi })
    t(`P3 prod k${kHi} subset k${kLo} h=${h}`, aHi === null || aLo !== null)
    t(`P3 corr k${kHi} subset k${kLo} h=${h}`, bHi === null || bLo !== null)
  }
}

// P4: maxCrystals cap gate - existing.length >= cap -> both models null.
const ex1 = [{ x: 0, y: 3, z: 2 }]
t('P4a cap blocks v75', prod.choosePlace({ ...args1, existing: ex1, maxCrystals: 1 }) === null)
t('P4b cap blocks corrected', corr.choosePlace({ ...args1, existing: ex1, maxCrystals: 1 }) === null)
t('P4c cap 2 unblocks v75', prod.choosePlace({ ...args1, existing: ex1, maxCrystals: 2 }) !== null)

// P5: whole-driver determinism - two runs byte-identical.
const r1 = execFileSync(process.execPath, [path.join(root, 'gate-map-place.cjs'), root])
const r2 = execFileSync(process.execPath, [path.join(root, 'gate-map-place.cjs'), root])
t('P5 driver output byte-identical across runs', Buffer.compare(r1, r2) === 0)
const out = JSON.parse(r1.toString())

// P6: dirA example arithmetic: prodBestSd < health-keep <= corr bound.
let checked = 0
for (const perK of Object.values(out.gears)) {
  for (const rec of Object.values(perK)) {
    for (const ex of rec.dirAExamples) {
      t(`P6 dirA example consistent #${checked}`, ex.prodBestSd < ex.health - 6 && ex.corrMinMaxSd >= ex.health - 6)
      checked++
    }
  }
}
t('P6 dirA examples present', checked > 0)

// P7: noCandidate and capBlocked identical across k (reach and cap are k-independent).
for (const perK of Object.values(out.gears)) {
  const nc = Object.values(perK).map(r => r.noCandidate)
  const cb = Object.values(perK).map(r => r.capBlocked)
  t('P7a noCandidate k-invariant', nc.every(v => v === nc[0]))
  t('P7b capBlocked k-invariant', cb.every(v => v === cb[0]))
}

// P8: selection rows internally consistent.
let selOk = true
for (const agg of Object.values(out.selection.gears)) {
  for (const r of Object.values(agg)) {
    if (r.samePos + r.diffPos !== r.compared) selOk = false
    if (r.diffPos < 0 || r.samePos < 0 || r.compared < 0) selOk = false
  }
}
t('P8 selection rows consistent', selOk)

// P9: selection diff examples - each model's own pick is optimal under its OWN estimates,
// and the recorded cross-evaluated score gaps are material (> 1e-9), not tie noise.
let p9checked = 0, p9orderOk = true, p9materialOk = true
for (const agg of Object.values(out.selection.gears)) {
  for (const r of Object.values(agg)) {
    for (const ex of r.diffExamples) {
      p9checked++
      if (!(ex.prodScoreProdPick >= ex.prodScoreCorrPick - 1e-9)) p9orderOk = false
      if (!(ex.corrScoreCorrPick >= ex.corrScoreProdPick - 1e-9)) p9orderOk = false
      if (!(ex.prodScoreProdPick - ex.prodScoreCorrPick > 1e-9 || ex.corrScoreCorrPick - ex.corrScoreProdPick > 1e-9)) p9materialOk = false
    }
  }
}
t('P9a diff examples present', p9checked > 0)
t('P9b each model picks its own optimum', p9orderOk)
t('P9c recorded diffs are material, not ties', p9materialOk)

console.log(`gate-map-place-fixtures: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
