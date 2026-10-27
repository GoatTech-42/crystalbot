// Deterministic numerical regression vectors. Does not establish in-game accuracy.
'use strict'
const v = require('./vanilla26_2')
const cf = require('./crystal-fixed')
const prod = require('../pkg/crystal')
const gear = { armor: 20, toughness: 12, blastEpf: 32, resist: 0, absorb: 0, totems: 0 }
const nogear = { armor: 0, toughness: 0, blastEpf: 0, resist: 0, absorb: 0, totems: 0 }
let pass = 0, fail = 0
const eq = (name, got, want) => {
  const ok = Object.is(got, want)
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}: got ${got} want ${want}`) }
}
{ const r = v.singleHit(0, gear)
  eq('S1.raw', r.raw, 85); eq('S1.preArmor', r.preArmor, 127.5); eq('S1.hp', r.hp, 21.420000076293945) }
{ const r = v.singleHit(12, gear)
  eq('S2.raw', r.raw, 1); eq('S2.preArmor', r.preArmor, 1.5); eq('S2.hp', r.hp, 0.06359998136758804) }
eq('S3.outOfRange', v.singleHit(13, gear).hp, 0)
{ const r = v.singleHit(6, nogear)
  eq('S8.raw', r.raw, 32.5); eq('S8.preArmor', r.preArmor, 48.75); eq('S8.hp', r.hp, 48.75) }
eq('A4.sqrt101.hp', v.singleHit(Math.sqrt(101), gear).hp, 0.8234581351280212)
eq('A5.sqrt65.hp', v.singleHit(Math.sqrt(65), gear).hp, 2.4998843669891357)
eq('A6.sqrt37.hp', v.singleHit(Math.sqrt(37), gear).hp, 5.5839619636535645)
eq('A7.sqrt17.hp', v.singleHit(Math.sqrt(17), gear).hp, 10.639627456665039)
console.log('TRANSCRIPTION-LEVEL (report only, unknown-version/reconstructed/transcribed):')
for (const [d2, meas] of [[101, 0.823457718], [65, 2.499883652], [37, 5.583961487], [17, 10.639627457]]) {
  const hp = v.singleHit(Math.sqrt(d2), gear).hp
  console.log(`  sqrt(${d2}): impl ${hp} vs transcribed ${meas} diff ${(hp - meas).toExponential(2)}`)
}
eq('R1.prod.hp', prod.crystalHp(Math.sqrt(17), gear), 3.2843999999999993)
eq('R1.prod.raw', prod.crystalDamage(Math.sqrt(17)), 34.5)
eq('R1.corr.hp', cf.crystalHp(Math.sqrt(17), gear), 10.639627456665039)
{ const c = cf.chainDamage([5, 5], gear)
  eq('C1.total', c.max, 8.087656021118164); eq('C1.secondGated', c.hits[1].gated, null) }
eq('C2.farFirst', v.chainHits([{ dist: 8, ticks: 0 }, { dist: 4, ticks: 0 }], gear).totalHp, 7.074798583984375)
eq('C3.nearFirst', v.chainHits([{ dist: 4, ticks: 0 }, { dist: 8, ticks: 0 }], gear).totalHp, 11.039599418640137)
eq('C4.ticks10.twoFull', v.chainHits([{ dist: 5, ticks: 0 }, { dist: 5, ticks: 10 }], gear).totalHp, 16.175312042236328)
eq('C5.ticks9.gated', v.chainHits([{ dist: 5, ticks: 0 }, { dist: 5, ticks: 9 }], gear).totalHp, 8.087656021118164)
{ const c = cf.chainDamage([7.2, 3.1, 9.9, 5.5], gear)
  eq('C6.min', c.min, 6.251787185668945); eq('C6.max', c.max, 13.923735618591309)
  eq('C6.maxIsNearestSingle.pinnedVectorOnly', c.max, cf.crystalHp(3.1, gear)) }
{ const base = cf.chainDamage([4.9, 5], gear)
  for (const p of [[23, 4.9, 5], [4.9, 23, 5], [4.9, 5, 23], [22, 23, 4.9, 5], [5, 4.9, 23, 22]]) {
    const c = cf.chainDamage(p, gear)
    eq('C7.inert.' + p.join('_') + '.min', c.min, base.min); eq('C7.inert.' + p.join('_') + '.max', c.max, base.max)
  }
  eq('C7.allOutOfRange', cf.chainDamage([23, 22], gear).max, 0) }
{ const sgl = v.singleHit(7.673, gear).hp
  const chn = v.chainHits([{ dist: 7.673, ticks: 0 }], gear).totalHp
  eq('C8.single.pinned', sgl, 2.9767699241638184)
  eq('C8.chain.pinned', chn, 2.9767704010009766)
  eq('C8.roundTripDiffers', Object.is(sgl, chn), false) }
eq('E1.easy', v.applyDifficulty(10, 'EASY'), Math.min(Math.fround(Math.fround(10 / 2) + 1), 10))
eq('E1.normal', v.applyDifficulty(10, 'NORMAL'), 10)
eq('E1.peaceful', v.applyDifficulty(10, 'PEACEFUL'), 0)
eq('E1.hardTwoRoundings', v.applyDifficulty(10, 'HARD'), Math.fround(Math.fround(10 * 3) / 2))
eq('E2.armorFloorValue', Math.fround(Math.fround(20) * Math.fround(0.2)), 4)
{ const d = v.afterArmor(81, 20, 12), expect = Math.fround(81 * Math.fround(1 - Math.fround(4 / 25)))
  eq('E2.armorFloorBinds', d, expect) }
console.log(`fixtures-corr: ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
