# AGENTS.md

## Workspace boundary (STRICT)

This project (INFLUVERSE) has exactly four working folders:

| Folder | What it is |
|---|---|
| `website/` | Next.js 14 marketplace (brands + creators) |
| `dashboard/` | React + Vite admin dashboard |
| `server/` | Express + MongoDB (Mongoose) backend |
| `docs/` | Project docs (HLD, LLD, notes) |

Rules:

1. **Only read, search, create, edit or delete files inside these four folders.**
2. **Never go outside `c:\STA_RAKIB\Frontend\INFLUVERSE`.** Do not read, list, search or modify sibling projects (e.g. `c:\STA_RAKIB\Frontend\*`) or any other path on the machine.
3. Root-level files of this repo (`AGENTS.md`, `.gitignore`, etc.) may be changed **only when the user explicitly asks**.
4. Shell commands must run inside one of the four folders (or the repo root). No `cd ..` out of the repo, no absolute paths outside it.
5. Exceptions: installed dependencies (`node_modules/`) inside the four folders may be read for reference, but never edited.
6. If a task seems to need anything outside these folders, **stop and ask the user first**.