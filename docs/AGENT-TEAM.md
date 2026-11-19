# PG Companion build team

How the twice-weekly build sessions (Wed + Sat, 10:23 IST) divide the work. Agent definitions live in `.claude/agents/`.

## Hierarchy

```
Sriram — Owner / Chief Medical Reviewer
│   approves PRs, verifies clinical content, ticks "Verified" in the tracker
│
└── Lead Architect (orchestrator — the scheduled session itself)
    │   plans, delegates, integrates; ONLY role that merges to main,
    │   updates the tracker and messages Sriram
    │
    ├── Content & rules ──────────────────────────────
    │   ├── clinical-content   department data with cited sources + REVIEW.md
    │   └── compliance         NMC (PGMER-2023) / NDC (MDS) rules, competencies, audit
    │
    ├── Build ────────────────────────────────────────
    │   ├── frontend-builder   screens and workflows (plain JS, mobile-first, offline)
    │   ├── thesis-biostat     Thesis Studio, questionnaires, statistics, thesis export
    │   └── integration        registry, migrations, lab orders, referrals, batch hub
    │
    ├── Independent gates (fresh context, never see the build) ──
    │   ├── qa-tester          full test suite + new tests → PASS / FAIL
    │   └── security-privacy   privacy & security review → PASS / BLOCK (veto)
    │
    └── docs-release           CHANGELOG, README, roadmap, PR text, message draft
```

## Who decides

| Question | Decides | Escalate to |
|---|---|---|
| Clinical fact, dose, score, cut-off | clinical-content (with source) | Sriram via REVIEW.md "Open questions" |
| NMC / NDC requirement | compliance (with citation) | Sriram |
| Patient privacy / security | security-privacy (veto) | Sriram |
| Architecture, scope, order of work | Lead Architect | Sriram |
| Merge to main | Lead Architect, only after QA PASS + security PASS | — |

## Session flow

**Wednesday — content day (Session A)**
1. Lead reads tracker, open PRs/issues, writes the session plan.
2. `clinical-content` ∥ `compliance` (parallel) → department pack + competencies + REVIEW.md.
3. `qa-tester` checks formulas against worked examples in REVIEW.md.
4. Lead opens PR "Review: <Department> pack" (not merged). `docs-release` writes the PR text and message.
5. Sriram reviews that evening (3 h) and comments on the PR.

**Saturday — build day (Session B)**
1. Lead reads Sriram's comments → `clinical-content` applies content fixes.
2. `frontend-builder` (+ `thesis-biostat` in W1, `integration` in W11–W12) builds the workflows.
3. `qa-tester` ∥ `security-privacy` (parallel, fresh contexts).
4. FAIL/BLOCK → fix loop through the builder (max 2 rounds), else leave the PR open and report.
5. PASS + PASS → Lead merges behind the beta flag → deploy check → `docs-release` → tracker + message.
6. Sriram phone-tests that evening (3 h) and files issues labelled `dept:<id>`.

**Sunday** — the existing weekly-improvement run fixes small bugs from those issues.

## Ground rules for every agent
- Never send patient data, photos or identifiers to any server; never weaken encryption; never widen `firestore.rules`; never change the Firebase config; never remove features.
- No guessing medical or regulatory facts: cite or ask.
- Each agent stays inside its files and hands everything else back to the Lead.
