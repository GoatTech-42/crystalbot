# Crystalbot estimator source

Pure JavaScript damage estimates, gear and enchantment helpers, and deterministic regression vectors. This is a source-preservation snapshot, not a complete runnable Minecraft bot or a claim that these estimates match a current server.

- `pkg/`: earlier estimator and its ordinary dependencies.
- `corrections/`: a numerical correction candidate and a separate vanilla-style model.
- `corrections/fixtures-corr.cjs`: 251 deterministic checks across the models. Values printed as transcription-level comparisons are reports, not assertions of measured server accuracy.
- `divergence-map.cjs` and `divergence-map-out.json`: an offline comparison of the earlier estimator against the correction candidate over chosen synthetic scenarios, with its recorded output.
- `gate-map.cjs` and `gate-map-place.cjs`, with their fixtures and recorded outputs: offline measurement of where the two models permit or forbid break and place decisions over chosen synthetic scenarios. The scenario sets are synthetic distributions, not recorded duels, and the correction candidate is a different model, not measured server truth.

Run the finite suites with Node.js:

```
node corrections/fixtures-corr.cjs
node gate-map-fixtures.cjs
node gate-map-place-fixtures.cjs
```

No login, game connection or external package install is needed. The tests establish numerical regression consistency only. They do not establish in-game behavior, targeting safety, server-rule compliance, or a production release.

The historical controller/adapter runner is not included because its original source bytes were not recovered. Do not infer a current deployed bot from these modules. Internal workflow comments were removed without changing JavaScript code.
