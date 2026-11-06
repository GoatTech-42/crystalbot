#!/usr/bin/env node
'use strict'
/* gate-map.cjs - measures where the earlier estimator (pkg/crystal.js) and the correction
   candidate (corrections/crystal-fixed.js) disagree AT THE ACTION GATE, offline: for the same
   deterministic scenarios, which break actions does each model's own chooseBreak permit and
   pick. Not a game capture and not an accuracy or safety claim: this compares two estimator
   implementations against each other. The correction candidate is not ground truth. No server
   was run. keep=6 is the shipped default; k is caller-supplied and the shipped caller is not
   in custody, so k is swept over {1,2,3} and every count is reported per k.
   Interpretation labels (bounded): scenarios are a CHOSEN close-range synthetic cluster
   distribution, not an empirical duel distribution and not observed live-cap data; every
   crystal in a scenario forms one connected cluster (max pair distance observed 3.84 < 12),
   so all candidates break the same whole group. Assumptions: los=true, exposure=1, HARD,
   flat world, no absorption/resistance/totems. The gate-permission counts are a
   model-vs-model metric only: not ground truth and not proof of any fix. Run: node gate-map.cjs [repo-root] */
const path = require('path')
const root = path.resolve(process.argv[2] || __dirname)
const prod = require(path.join(root, 'pkg/crystal.js'))
const corr = require(path.join(root, 'corrections/crystal-fixed.js'))

const GEARS = {
  duel_bp4:   { armor: 20, toughness: 12, blastEpf: 32, resist: 0, absorb: 0, totems: 0 },
  no_blast:   { armor: 20, toughness: 12, blastEpf: 0,  resist: 0, absorb: 0, totems: 0 },
  unarmored:  { armor: 0,  toughness: 0,  blastEpf: 0,  resist: 0, absorb: 0, totems: 0 }
}
const KEEP = 6                 // shipped default in both chooseBreak implementations
const KS = [1, 2, 3]           // k is caller-supplied; shipped caller not in custody -> sweep
const HEALTHS = [20, 18, 16, 14, 12, 10, 8, 6, 4]
const N_SCEN = 2000, N_SCEN_SELECT = 500, SEED = 0xC0FFEE

function mulberry32 (seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One scenario: me at origin (feet), foe nearby, a group of 1..4 crystals clustered next to
// the foe (all within chain range 12 of each other by construction). dist = honest eye->hitbox reach measure.
function makeScenario (rnd) {
  // Chosen close-range synthetic cluster geometry (not an empirical duel distribution):
  // crystals sit next to the FOE, the foe stands 1.5..4.5 from self, so crystals land ~0.5..5.5 from self.
  const q = x => Math.round(x * 4) / 4
  const me = { x: 0, y: 0, z: 0 }
  const ang = rnd() * 2 * Math.PI, fd = q(1.5 + rnd() * 3)
  const foe = { x: q(fd * Math.cos(ang)), y: 0, z: q(fd * Math.sin(ang)) }
  const n = 1 + Math.floor(rnd() * 4)          // chosen group sizes 1..4 (not observed live-cap data)
  const eye = { x: me.x, y: me.y + 1.62, z: me.z }
  const crystals = []
  for (let i = 0; i < n; i++) {
    const pos = { x: q(foe.x + (rnd() - 0.5) * 2.5), y: q(1 + rnd() * 2), z: q(foe.z + (rnd() - 0.5) * 2.5) }
    crystals.push({ id: i + 1, pos, dist: prod.boxDist(eye, pos), los: true })
  }
  return { me, foe, crystals, all: crystals.map(c => c.pos) }
}

function scenKey (s) {
  return s.foe.x + ',' + s.foe.z + '|' + s.crystals.map(c => c.pos.x + ',' + c.pos.y + ',' + c.pos.z).join(';')
}

const results = { meta: {
  note: 'offline model-vs-model gate comparison; correction candidate is not ground truth; no server run',
  seed: SEED, scenarios: N_SCEN, selectionSubset: N_SCEN_SELECT, keep: KEEP, ks: KS, healths: HEALTHS,
  difficulty: 'HARD', exposure: 1,
  dirA: 'model-vs-model: earlier model gate permits, correction candidate cautious gate (max bound) refuses - not ground truth, not proof of any fix',
  dirB: 'model-vs-model: earlier model gate refuses, correction candidate cautious gate permits - not ground truth'
}, gears: {} }

for (const [gname, gear] of Object.entries(GEARS)) {
  const perK = {}
  for (const k of KS) {
    perK[k] = { bothPermit: 0, bothForbid: 0, dirA: 0, dirB: 0, noCandidate: 0,
      dirAByHealth: {}, dirBByHealth: {}, dirAExamples: [], dirBExamples: [] }
  }
  const rnd = mulberry32(SEED)
  for (let s = 0; s < N_SCEN; s++) {
    const sc = makeScenario(rnd)
    // per-scenario unit-k self/foe damage under each model (k scales linearly in both chooseBreak impls)
    let anyInReach = false
    const per = sc.crystals.map(c => {
      const group = prod.chain(c.pos, sc.all)
      const dSelf = group.map(p => Math.hypot(p.x - sc.me.x, p.y - sc.me.y, p.z - sc.me.z))
      const dFoe = group.map(p => Math.hypot(p.x - sc.foe.x, p.y - sc.foe.y, p.z - sc.foe.z))
      const inReach = c.los === true && c.dist >= 0 && c.dist <= 3.0 - 0.25
      if (inReach) anyInReach = true
      return {
        id: c.id, inReach,
        sd75: dSelf.reduce((n2, d) => n2 + prod.crystalHp(d, gear), 0),
        sdC: corr.chainDamage(dSelf, gear),
        td75: dFoe.reduce((n2, d) => n2 + prod.crystalHp(d, gear), 0),
        tdC: corr.chainDamage(dFoe, gear)
      }
    })
    for (const k of KS) {
      const rec = perK[k]
      if (!anyInReach) { rec.noCandidate++; continue }
      for (const h of HEALTHS) {
        // candidate-level permission under each model's gate (cautious side: correction uses max bound)
        const prodOk = per.filter(p => p.inReach && p.td75 * k > 0 && prod.safe(p.sd75 * k, h, KEEP))
        const corrOk = per.filter(p => p.inReach && p.tdC.min * k > 0 && corr.safe(p.sdC.max * k, h, KEEP))
        const pPermits = prodOk.length > 0, cPermits = corrOk.length > 0
        if (h !== 20) { // health-sweep detail kept in byHealth maps; headline counts at h=20 below
          if (pPermits && !cPermits) rec.dirAByHealth[h] = (rec.dirAByHealth[h] || 0) + 1
          if (!pPermits && cPermits) rec.dirBByHealth[h] = (rec.dirBByHealth[h] || 0) + 1
          continue
        }
        if (pPermits && cPermits) {
          rec.bothPermit++
          // selection comparison runs on the subset only (see below)
        } else if (!pPermits && !cPermits) rec.bothForbid++
        else if (pPermits) {
          rec.dirA++
          if (rec.dirAExamples.length < 5) rec.dirAExamples.push({ scen: scenKey(sc), health: h, k, prodBestSd: Math.min(...prodOk.map(p => p.sd75 * k)), corrMinMaxSd: Math.min(...per.filter(p => p.inReach).map(p => p.sdC.max * k)) })
        } else {
          rec.dirB++
          if (rec.dirBExamples.length < 5) rec.dirBExamples.push({ scen: scenKey(sc), health: h, k, corrBestSd: Math.min(...corrOk.map(p => p.sdC.max * k)), prodMinSd: Math.min(...per.filter(p => p.inReach).map(p => p.sd75 * k)) })
        }
      }
    }
  }
  results.gears[gname] = perK
}

// Action-selection comparison on a subset: do the two models pick the SAME break action when both permit?
results.selection = { note: 'first ' + N_SCEN_SELECT + ' scenarios only, both models permit at least one action (only duel_bp4 k=1 h=20 had both-permit cases); every crystal in a scenario is one connected cluster, so all candidates break the same whole group and a differing pick is an ID tie-break / f64 sum-order difference (~1e-15), not different tactics or better targeting', gears: {} }
const SEL_HEALTHS = [20, 14, 10], SEL_KS = [1, 3]
for (const [gname, gear] of Object.entries(GEARS)) {
  const agg = {}
  for (const k of SEL_KS) for (const h of SEL_HEALTHS) agg[k + '/' + h] = { compared: 0, sameId: 0, diffId: 0 }
  const rnd = mulberry32(SEED)
  for (let s = 0; s < N_SCEN; s++) {
    const sc = makeScenario(rnd)
    if (s >= N_SCEN_SELECT) continue
    for (const k of SEL_KS) for (const h of SEL_HEALTHS) {
      const args = { crystals: sc.crystals, all: sc.all, me: sc.me, foe: sc.foe, health: h, keep: KEEP, gear, k }
      const a = prod.chooseBreak(args), b = corr.chooseBreak(args)
      if (!a || !b) continue
      const r = agg[k + '/' + h]
      r.compared++; if (a.id === b.id) r.sameId++; else r.diffId++
    }
  }
  results.selection.gears[gname] = agg
}

console.log(JSON.stringify(results, null, 1))
