import { int, procedure } from 'drizzle-orm/pg-core'

procedure('grade_report', { score: 'int', retries: 'int' }, (ctx) => {
  const { notice } = ctx
  const { score, retries } = ctx.args
  if (score >= 90) {
    notice('excellent')
  } else if (score >= 50) {
    notice('pass')
  } else if (retries === 0) {
    notice('failed with no retries left')
    return
  } else {
    notice('failed')
  }

  let attempts: int = retries
  while (attempts > 0) {
    notice('retry available')
    attempts = attempts - 1
  }
})
