# DT900 migration preparation

Pure compatibility prototype, not connected to the application or GAS.
No migration, production edit, API request, retry or cancellation is performed.

`compatibility.cjs` preserves source events and their cancellation pointers.
`verify.cjs` requires an authorized local snapshot, the referenced GAS source
(or extracted source-state loader) and optionally the original app router:

```
node verify.cjs fixture.json reference.gs verification.json [app-router.js]
```

Source integration is intentionally incomplete: the retrieved GAS file calls
`getAppInitialData` but does not define it. Obtain the complete deployed script
before changing live routing, cache revisions, derived formulas or cancellation.
Do not enable this prototype in production. A migration registry and atomic
cutover procedure, full integration tests and reviewed rollback remain required.
The current retry, batch journal, locks, checkout cache and transition rules
remain unchanged.
