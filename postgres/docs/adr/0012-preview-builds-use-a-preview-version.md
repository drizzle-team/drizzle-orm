# Preview builds publish as `0.0.0-preview-<sha>`

Preview builds (pkg.pr.new) rewrite the package version to `0.0.0-preview-<sha>`. If a preview kept the source version, a preview built at `0.3.3` could stay in a consumer's lockfile and shadow the real `0.3.3` after it is released.
