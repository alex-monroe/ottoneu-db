import re

content = open("AGENTS.md", "r").read()
# Replace barefoot references with docs/ path
content = content.replace("├── feature-projections.md", "├── docs/exec-plans/feature-projections.md")
content = content.replace("├── qb-usage-share.md", "├── docs/exec-plans/qb-usage-share.md")
content = content.replace("├── player-diagnostics.md", "├── docs/generated/player-diagnostics.md")
content = content.replace("├── projection-accuracy.md", "├── docs/generated/projection-accuracy.md")
content = content.replace("└── segment-analysis.md", "└── docs/generated/segment-analysis.md")

with open("AGENTS.md", "w") as f:
    f.write(content)

content = open("CLAUDE.md", "r").read()
# Replace barefoot references with docs/ path
content = content.replace("├── feature-projections.md", "├── docs/exec-plans/feature-projections.md")
content = content.replace("└── qb-usage-share.md", "└── docs/exec-plans/qb-usage-share.md")
content = content.replace("├── player-diagnostics.md", "├── docs/generated/player-diagnostics.md")
content = content.replace("├── projection-accuracy.md", "├── docs/generated/projection-accuracy.md")
content = content.replace("└── segment-analysis.md", "└── docs/generated/segment-analysis.md")

with open("CLAUDE.md", "w") as f:
    f.write(content)
