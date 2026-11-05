#!/usr/bin/env node
'use strict'
/* gate-map-place.cjs - place-side companion to gate-map.cjs. Measures where the earlier
   estimator (pkg/crystal.js) and the correction candidate (corrections/crystal-fixed.js)
   disagree AT THE PLACE ACTION GATE, offline: for the same deterministic scenarios, which
   place actions does each model's own choosePlace permit and pick. Not a game capture and
   not an accuracy or safety claim: this compares two estimator implementations against each
   other. The correction candidate is not ground truth. No server was run. keep=6 is the
   shipped default; k and maxCrystals are caller-supplied and the shipped caller is not in
   custody, so k is swept over {1,2,3} and maxCrystals is drawn per scenario over 1..4, with
   every count reported per k.
   Interpretation labels (bounded): scenarios are a CHOSEN close-range synthetic cluster
   distribution, not an empirical duel distribution and not observed live-cap data; crystals
   and candidate bases cluster next to one foe, so groups are connected by construction
   (observed max pair distance recorded in output). Assumptions: los=true, airAbove=true,
   exposure=1, HARD, flat world, no absorption/resistance/totems. The gate-permission counts
   are a model-vs-model metric only: not ground truth and not proof of any fix.
   Run: node gate-map-place.cjs [repo-root] */
const path = require('path')
const root = path.resolve(process.argv[2] || __dirname)
const prod = require(path.join(root, 'pkg/crystal.js'))
const corr = require(path.join(root, 'corrections/crystal-fixed.js'))

const GEARS = {
  duel_bp4:   { armor: 20, toughness: 12, blastEpf: 32, resist: 0, absorb: 0, totems: 0 },
  no_blast:   { armor: 20, toughness: 12, blastEpf: 0,  resist: 0, absorb: 0, totems: 0 },
  unarmored:  { armor: 0,  toughness: 0,  blastEpf: 0,  resist: 0, absorb: 0, totems: 0 }
}
const KEEP = 6                 // shipped default in both choosePlace implementations
const KS = [1, 2, 3]           // k is caller-supplied; shipped caller not in custody -> sweep
const HEALTHS = [20, 18, 16, 14, 12, 10, 8, 6, 4]
const REACH_P = 4.5 - 0.25, REACH_B = 3.0 - 0.25   // LIMITS.reachPlace / reachMelee minus margin
const N_SCEN = 2000, N_SCEN_SELECT = 500, SEED = 0xBEEF

function mulberry32 (seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One scenario: me at origin (feet), foe 1.5..4.5 away, 0..3 existing crystals clustered next
// to the foe, 1..4 candidate base blocks also next to the foe (crystal would sit on top).
// Chosen close-range synthetic cluster geometry (not an empirical duel distribution).
// dist = eye->base-top place reach; breakDist = honest eye->hitbox measure of the would-be crystal.
function makeScenario (rnd) {
  const q = x => Math.round(x * 4) / 4
  const me = { x: 0, y: 0, z: 0 }
  const ang = rnd() * 2 * Math.PI, fd = q(1.5 + rnd() * 3)
  const foe = { x: q(fd * Math.cos(ang)), y: 0, z: q(fd * Math.sin(ang)) }
  const eye = { x: me.x, y: me.y + 1.62, z: me.z }
  const nEx = Math.floor(rnd() * 4)            // 0..3 existing crystals
  const existing = []
  for (let i = 0; i < nEx; i++) {
    existing.push({ x: q(foe.x + (rnd() - 0.5) * 2.5), y: q(1 + rnd() * 2), z: q(foe.z + (rnd() - 0.5) * 2.5) })
  }
  const nB = 1 + Math.floor(rnd() * 4)         // 1..4 candidate bases
  const bases = []
  for (let i = 0; i < nB; i++) {
    const pos = { x: q(foe.x + (rnd() - 0.5) * 2.5), y: Math.floor(rnd() * 2), z: q(foe.z + (rnd() - 0.5) * 2.5) }
    const c = { x: pos.x + 0.5, y: pos.y + 1, z: pos.z + 0.5 }
    bases.push({ pos, dist: Math.hypot(eye.x - c.x, eye.y - (pos.y + 1), eye.z - c.z),
      breakDist: prod.boxDist(eye, c), los: true, airAbove: true, c })
  }
  const maxCrystals = 1 + Math.floor(rnd() * 4) // caller-supplied cap, drawn 1..4
  return { me, foe, existing, bases, maxCrystals }
}

function scenKey (s) {
  return s.foe.x + ',' + s.foe.z + '|ex:' + s.existing.map(p => p.x + ',' + p.y + ',' + p.z).join(';') +
    '|b:' + s.bases.map(b => b.pos.x + ',' + b.pos.y + ',' + b.pos.z).join(';') + '|cap' + s.maxCrystals
}

const results = { meta: {
  note: 'offline model-vs-model PLACE-gate comparison; correction candidate is not ground truth; no server run',
  seed: SEED, scenarios: N_SCEN, selectionSubset: N_SCEN_SELECT, keep: KEEP, ks: KS, healths: HEALTHS,
  difficulty: 'HARD', exposure: 1, assumptions: 'los=true, airAbove=true, flat world, no absorb/resist/totems',
  distribution: 'chosen close-range synthetic cluster, not empirical duel / not observed live-cap data',
  dirA: 'model-vs-model: earlier model gate permits, correction candidate cautious gate (max bound) refuses - not ground truth, not proof of any fix',
  dirB: 'model-vs-model: earlier model gate refuses, correction candidate cautious gate permits - not ground truth'
}, gears: {}, maxPairDist: 0 }

for (const [gname, gear] of Object.entries(GEARS)) {
  const perK = {}
  for (const k of KS) {
    perK[k] = { bothPermit: 0, bothForbid: 0, dirA: 0, dirB: 0, noCandidate: 0, capBlocked: 0,
      dirAByHealth: {}, dirBByHealth: {}, dirAExamples: [], dirBExamples: [] }
  }
  const rnd = mulberry32(SEED)
  for (let s = 0; s < N_SCEN; s++) {
    const sc = makeScenario(rnd)
    // observed cluster spread (existing + candidate crystal positions)
    const pts = [...sc.existing, ...sc.bases.map(b => b.c)]
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z)
      if (d > results.maxPairDist) results.maxPairDist = +d.toFixed(2)
    }
    const capBlocked = sc.existing.length >= sc.maxCrystals
    const per = sc.bases.map(b => {
      const group = prod.chain(b.c, [b.c, ...sc.existing])
      const dSelf = group.map(p => Math.hypot(p.x - sc.me.x, p.y - sc.me.y, p.z - sc.me.z))
      const dFoe = group.map(p => Math.hypot(p.x - sc.foe.x, p.y - sc.foe.y, p.z - sc.foe.z))
      const valid = b.los === true && b.airAbove === true && b.dist >= 0 && b.dist <= REACH_P && b.breakDist <= REACH_B
      return {
        pos: b.pos, valid,
        sd75: dSelf.reduce((n2, d) => n2 + prod.crystalHp(d, gear), 0),
        sdC: corr.chainDamage(dSelf, gear),
        td75: dFoe.reduce((n2, d) => n2 + prod.crystalHp(d, gear), 0),
        tdC: corr.chainDamage(dFoe, gear)
      }
    })
    const anyValid = per.some(p => p.valid)
    for (const k of KS) {
      const rec = perK[k]
      if (capBlocked) { rec.capBlocked++; continue }
      if (!anyValid) { rec.noCandidate++; continue }
      for (const h of HEALTHS) {
        const prodOk = per.filter(p => p.valid && p.td75 * k > 0 && prod.safe(p.sd75 * k, h, KEEP))
        const corrOk = per.filter(p => p.valid && p.tdC.min * k > 0 && corr.safe(p.sdC.max * k, h, KEEP))
        const pPermits = prodOk.length > 0, cPermits = corrOk.length > 0
        if (h !== 20) {
          if (pPermits && !cPermits) rec.dirAByHealth[h] = (rec.dirAByHealth[h] || 0) + 1
          if (!pPermits && cPermits) rec.dirBByHealth[h] = (rec.dirBByHealth[h] || 0) + 1
          continue
        }
        if (pPermits && cPermits) rec.bothPermit++
        else if (!pPermits && !cPermits) rec.bothForbid++
        else if (pPermits) {
          rec.dirA++
          if (rec.dirAExamples.length < 5) rec.dirAExamples.push({ scen: scenKey(sc), health: h, k, prodBestSd: Math.min(...prodOk.map(p => p.sd75 * k)), corrMinMaxSd: Math.min(...per.filter(p => p.valid).map(p => p.sdC.max * k)) })
        } else {
          rec.dirB++
          if (rec.dirBExamples.length < 5) rec.dirBExamples.push({ scen: scenKey(sc), health: h, k, corrBestSd: Math.min(...corrOk.map(p => p.sdC.max * k)), prodMinSd: Math.min(...per.filter(p => p.valid).map(p => p.sd75 * k)) })
        }
      }
    }
  }
  results.gears[gname] = perK
}

// Action-selection comparison on a subset: when both models permit, do they pick the SAME base?
// A differing pick here can be real (each base adds its own crystal position, so groups and
// damages differ per base) - diff examples carry both models' scores of both picks for review.
results.selection = { note: 'first ' + N_SCEN_SELECT + ' scenarios only, both models permit at least one place action; differing picks include cross-evaluated scores so tie-level (sum-order ~1e-15) and material ranking disagreements are distinguishable', gears: {} }
const SEL_HEALTHS = [20, 14, 10], SEL_KS = [1, 3]
for (const [gname, gear] of Object.entries(GEARS)) {
  const agg = {}
  for (const k of SEL_KS) for (const h of SEL_HEALTHS) agg[k + '/' + h] = { compared: 0, samePos: 0, diffPos: 0, diffExamples: [] }
  const rnd = mulberry32(SEED)
  for (let s = 0; s < N_SCEN; s++) {
    const sc = makeScenario(rnd)
    if (s >= N_SCEN_SELECT) continue
    for (const k of SEL_KS) for (const h of SEL_HEALTHS) {
      const args = { bases: sc.bases, existing: sc.existing, maxCrystals: sc.maxCrystals, me: sc.me, foe: sc.foe, health: h, keep: KEEP, gear, k }
      const a = prod.choosePlace(args), b = corr.choosePlace(args)
      if (!a || !b) continue
      const r = agg[k + '/' + h]
      r.compared++
      const same = a.pos.x === b.pos.x && a.pos.y === b.pos.y && a.pos.z === b.pos.z
      if (same) { r.samePos++; continue }
      r.diffPos++
      if (r.diffExamples.length < 5) {
        // cross-evaluate: what would each model score the OTHER model's pick?
        const scoreOf = (mod, pickPos) => {
          const b2 = sc.bases.find(x => x.pos.x === pickPos.x && x.pos.y === pickPos.y && x.pos.z === pickPos.z)
          const group = mod.chain(b2.c, [b2.c, ...sc.existing])
          const dS = group.map(p => Math.hypot(p.x - sc.me.x, p.y - sc.me.y, p.z - sc.me.z))
          const dF = group.map(p => Math.hypot(p.x - sc.foe.x, p.y - sc.foe.y, p.z - sc.foe.z))
          if (mod === prod) {
            const sd = dS.reduce((n2, d) => n2 + prod.crystalHp(d, gear), 0) * k
            const td = dF.reduce((n2, d) => n2 + prod.crystalHp(d, gear), 0) * k
            return td - sd
          }
          const sd = corr.chainDamage(dS, gear).max * k
          const td = corr.chainDamage(dF, gear).min * k
          return td - sd
        }
        r.diffExamples.push({ k, health: h, prodPick: a.pos, corrPick: b.pos,
          prodScoreProdPick: scoreOf(prod, a.pos), prodScoreCorrPick: scoreOf(prod, b.pos),
          corrScoreCorrPick: scoreOf(corr, b.pos), corrScoreProdPick: scoreOf(corr, a.pos) })
      }
    }
  }
  results.selection.gears[gname] = agg
}

console.log(JSON.stringify(results, null, 1))
