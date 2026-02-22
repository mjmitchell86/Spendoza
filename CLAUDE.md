# Spendoza - Personal & Household Finance Tracker

## Tech Stack

- **Runtime:** Bun
- **Backend:** Express (TypeScript)
- **Frontend:** React with Vite (TypeScript)
- **UI:** shadcn/ui, Tailwind CSS
- **Charts:** Recharts
- **Data Fetching:** TanStack Query
- **Validation:** Zod
- **AI:** LangChain, OpenAI
- **Database:** Supabase (PostgreSQL)
- **Build System:** Turborepo
- **Deployment:** Vercel

## Monorepo Structure

```
packages/
  shared/   # Shared Zod schemas, types, and utilities
  api/      # Express backend API
  web/      # React/Vite frontend
```

## Common Commands

```bash
bun run dev        # Start all packages in dev mode
bun run build      # Build all packages
bun run test       # Run all tests
bun run lint       # Lint all packages
bun run typecheck  # Type-check all packages
bun run format     # Format all files with Prettier
```

## Per-Package Development

```bash
cd packages/api && bun run dev    # Start API server only
cd packages/web && bun run dev    # Start web frontend only
```

## Git Workflow

- **Always work on a feature branch**, never commit directly to `main` or `test`.
- After completing changes, **push the branch to GitHub** and **create a PR against the `test` branch**.
- Use `gh pr create --base test` to target the test branch.

## Conventions

- **Shared Zod schemas** live in `packages/shared` and are imported by both `api` and `web`.
- **API validation** uses Zod middleware to validate request bodies, params, and query strings.
- **TDD for backend**: Write tests first for API routes and business logic.
