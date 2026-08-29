# Checkout handoff test plan

CI must prove the staging workflow sets `persist-credentials: false` on the exact-candidate checkout and retains both exact-HEAD and porcelain clean-tree checks. The executable regression test lives at `scripts/__tests__/staging-workflow-checkout.test.mjs`.
