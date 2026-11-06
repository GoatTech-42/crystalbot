'use strict'
// Normalize an item's enchantments to [{ name, lvl }] across mineflayer/prismarine-item shapes. Never throws; unknown shape => [].
// Seen/handled: legacy [{name,lvl}]; 1.20.5+ component data { enchantments: [{ id, level|lvl }] } or { enchantments: { 'minecraft:x': n } } or
// { 'minecraft:x': n } (map); numeric ids resolved via registry (registry.enchantments[id] / enchantmentsArray[id]); string ids lose 'minecraft:'.
const strip = (s) => typeof s === 'string' ? s.replace(/^minecraft:/, '') : null
function nameOf (id, registry) {
  if (typeof id === 'string') return strip(id)
  if (Number.isInteger(id) && registry) { const r = (registry.enchantments && registry.enchantments[id]) || (registry.enchantmentsArray && registry.enchantmentsArray[id]); return r && typeof r.name === 'string' ? strip(r.name) : null }
  return null
}
function fromRaw (raw, registry) {
  if (!raw || typeof raw !== 'object') return []
  if (Array.isArray(raw)) {
    return raw.map(e => e && typeof e === 'object' ? { name: nameOf(e.name !== undefined ? e.name : e.id, registry), lvl: Number.isFinite(e.lvl) ? e.lvl : e.level } : null)
      .filter(e => e && e.name && Number.isInteger(e.lvl) && e.lvl > 0)
  }
  if (raw.enchantments !== undefined) return fromRaw(raw.enchantments, registry)
  if (raw.levels !== undefined) return fromRaw(raw.levels, registry)
  // plain map { 'minecraft:blast_protection': 4 }
  return Object.entries(raw).filter(([k, v]) => Number.isInteger(v) && v > 0 && typeof k === 'string').map(([k, v]) => ({ name: strip(k), lvl: v }))
}
function normalizeEnchants (item, registry) {
  if (!item || typeof item !== 'object') return []
  let raw; try { raw = item.enchants } catch (e) { raw = undefined }
  let out = fromRaw(raw, registry)
  if (!out.length) { try { const c = item.componentMap && item.componentMap.get && item.componentMap.get('enchantments'); if (c) out = fromRaw(c.data, registry) } catch (e) {} }
  return out
}
function rawShape (item) { try { return JSON.stringify(item && item.enchants) } catch (e) { return 'unserializable' } }
module.exports = { normalizeEnchants, rawShape }
