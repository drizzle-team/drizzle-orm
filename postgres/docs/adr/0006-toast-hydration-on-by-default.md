# TOAST hydration is on by default

An UPDATE that does not touch a large TOASTed column sends that column as "unchanged" in the WAL. A consumer who has never heard of TOAST reads `e.new` as "the row after the update", so the driver fills those columns in by default. The `unchanged` field still says what the WAL carried, for consumers who need the raw view.
