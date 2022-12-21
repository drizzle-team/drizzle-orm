---
name: Bug report
about: Create a report to help us improve
title: "[BUG] "
labels: bug
assignees: ''

---

body:
  - type: markdown
    attributes:
      value: |
        ## Quick Bug Form
        Thank you for taking the time to file a bug report! Please fill out this form as completely as possible.

  - type: input
    attributes:
      label: What version of `drizzle-orm` are you using?
      placeholder: 0.0.0
    validations:
      required: true
  - type: textarea
    attributes:
      label: Describe the Bug
      description: Steps to reproduce
    validations:
      required: true
