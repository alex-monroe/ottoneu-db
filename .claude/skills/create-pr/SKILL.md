---
name: create-pr
description: Create a pull request for current changes
---
Follow these steps to create a pull request:

// turbo
1. Check out and update the main branch
`git checkout main && git pull origin main`

2. Create a new feature branch from main
`git checkout -b <descriptive-branch-name>`

3. Make your changes and commit them
`git add . && git commit -m "<clear-description-of-changes>"`

// turbo
4. Push the branch
`git push -u origin <descriptive-branch-name>`

// turbo
5. Create the pull request
`gh pr create --fill`
