#!/usr/bin/env node
'use strict'
/* gate-map-fixtures.cjs - deterministic checks for gate-map.cjs. Prints "gate-map-fixtures: N pass, M fail". */
const { execFileSync } = require('child_process')
const path = require('path')
const root = path.resolve(__dirname)
const prod = require(path.join(root, 'pkg/crystal.js'))
const corr = require(path.join(root, 'corrections/crystal-fixed.js'))

let pass = 0, fail = 0
const t = (name, cond) => { if (cond) { pass++ } else { fail++; console.log('FAIL', name) } }

// F1: hand-computed direction-A DAMAGE-level case, single crystal d=5, no_blast, h=20, k=1,
// keep=6. Damage values only: d=5 is not asserted to be a reachable action position.
const g = { armor: 20, toughness: 12, blastEpf: 0, resist: 0, absorb: 0, totems: 0 }
const sd75 = prod.crystalHp(5, g), sdC = corr.chainDamage([5], g)
t('F1a v75 estimate at d=5 matches hand calc (13.2)', Math.abs(sd75 - 13.1985) < 0.01)
t('F1b corrected exact bound at d=5 matches hand calc (40.44)', Math.abs(sdC.max - 40.4383) < 0.01)
t('F1c direction A: v75 permits, corrected refuses', prod.safe(sd75, 20, 6) === true && corr.safe(sdC.max, 20, 6) === false)

// F2: strict boundary - sd exactly health-keep refuses under both models' shared safe().
t('F2a boundary refuses', prod.safe(14, 20, 6) === false && corr.safe(14, 20, 6) === false)
t('F2b just-under permits', prod.safe(13.999, 20, 6) === true && corr.safe(13.999, 20, 6) === true)
t('F2c non-finite health refuses both', prod.safe(1, NaN, 6) === false && corr.safe(1, NaN, 6) === false)

// F3: k monotonicity - multiplying self damage can only shrink the permit set (both models).
for (const gg of [g, { armor: 0, toughness: 0, blastEpf: 0, resist: 0, absorb: 0, totems: 0 }]) {
  for (const h of [20, 14, 8]) {
    const d75 = prod.crystalHp(4.25, gg), dC = corr.chainDamage([4.25], gg)
    for (const [kLo, kHi] of [[1, 2], [2, 3]]) {
      t(`F3 prod k${kHi} subset k${kLo} h=${h} armor=${gg.armor}`,
        !(prod.safe(d75 * kHi, h, 6)) || prod.safe(d75 * kLo, h, 6))
      t(`F3 corr k${kHi} subset k${kLo} h=${h} armor=${gg.armor}`,
        !(corr.safe(dC.max * kHi, h, 6)) || corr.safe(dC.max * kLo, h, 6))
    }
  }
}

// F4: whole-driver determinism - two runs byte-identical.
const r1 = execFileSync(process.execPath, [path.join(root, 'gate-map.cjs'), root])
const r2 = execFileSync(process.execPath, [path.join(root, 'gate-map.cjs'), root])
t('F4 driver output byte-identical across runs', Buffer.compare(r1, r2) === 0)

// F5: direction-A example arithmetic inside the actual output: prodBestSd < health-keep <= corr bound.
const out = JSON.parse(r1.toString())
let checked = 0
for (const perK of Object.values(out.gears)) {
  for (const [k, rec] of Object.entries(perK)) {
    for (const ex of rec.dirAExamples) {
      t(`F5 dirA example consistent g=${checked}`, ex.prodBestSd < ex.health - 6 && ex.corrMinMaxSd >= ex.health - 6)
      checked++
    }
  }
}
t('F5 dirA examples present', checked > 0)

// F6: selection comparison only counts scenarios where both models returned an action.
let selOk = true
for (const agg of Object.values(out.selection.gears)) {
  for (const r of Object.values(agg)) {
    if (r.sameId + r.diffId !== r.compared) selOk = false
    if (r.diffId < 0 || r.sameId < 0 || r.compared < 0) selOk = false
  }
}
t('F6 selection rows internally consistent', selOk)

// F7: noCandidate identical across k (reach is k-independent) within each gear.
for (const perK of Object.values(out.gears)) {
  const vals = Object.values(perK).map(r => r.noCandidate)
  t('F7 noCandidate k-invariant', vals.every(v => v === vals[0]))
}

console.log(`gate-map-fixtures: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
