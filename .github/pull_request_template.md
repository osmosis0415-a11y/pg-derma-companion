## What this changes
<!-- One or two plain sentences. Link the week issue: "Part of #N". -->

## For Sriram to check (≈3 h)
- [ ] REVIEW.md: every formula, dose and cut-off has a source and looks right
- [ ] Open questions in REVIEW.md answered (comment on the PR)
- [ ] NMC / NDC competencies match the curriculum
- [ ] On the phone: Settings → Beta departments → try the new screens

## Team gates
- [ ] clinical-content — sources cited, open questions listed
- [ ] compliance — items covered: …
- [ ] qa-tester — PASS (all unit + e2e tests, no console errors)
- [ ] security-privacy — PASS (no patient data leaves the device, `esc()` everywhere, rules not widened)
- [ ] Copilot review — comments triaged by lead-architect
- [ ] PR checks (GitHub Actions) green

## Safety
- [ ] No new network calls or runtime dependencies
- [ ] Existing Derma data and backups still load
