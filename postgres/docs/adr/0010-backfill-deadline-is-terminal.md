# A backfill that passes its deadline is not retried

A backfill that is still running past its own deadline is a consumer-side problem, and more attempts will not fix it. A retry is also unsafe: the abandoned session has already created the slot, so the next session resumes past a baseline that was never read, which leaves a silent gap. A backfill deadline is therefore a fatal error.
