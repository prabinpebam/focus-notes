## Work package

<!-- WP-x.y and a one-line summary. -->

## Evidence record

```json
{
  "workPackage": "WP-x.y",
  "requirements": { "REQ-01": { "tests": ["path/to/test"], "result": "pass" } },
  "gates": { "check": "", "typecheck": "", "unit": "", "bench": "", "build": "", "journeys": "", "uiCheck": "", "axe": "", "codeql": "", "license": "" },
  "platforms": ["windows", "macos", "linux"],
  "designSystem": { "newComponents": [], "newTokens": [] },
  "network": { "newDestinations": [] },
  "docs": [],
  "decisions": []
}
```

## Definition of done

- [ ] Every acceptance check for the requirements is automated and passes
- [ ] No regressions on Windows, macOS, and Linux
- [ ] `ui:check` passes; no raw values, markup, or styles outside the allowed places
- [ ] Zero axe violations; keyboard path tested
- [ ] No budget regresses by more than 10%
- [ ] No new network destination, permission, or stored data without a decision
- [ ] License check passes
- [ ] Spec pages describe what was built; deviations recorded as decisions
- [ ] Required reviews approve