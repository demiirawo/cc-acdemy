# Care Cuddle Academy

Live at **[www.care-cuddle-academy.co.uk](https://www.care-cuddle-academy.co.uk)**.

## Local development

Requires Node.js & npm ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to the project directory
cd cc-acdemy

# Install dependencies
npm i

# Start the dev server with auto-reloading and an instant preview
npm run dev
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase (Postgres, RLS, edge functions, pg_cron)

## Deployment

Pushing to `main` on GitHub triggers a Cloudflare Pages build that deploys automatically to
[www.care-cuddle-academy.co.uk](https://www.care-cuddle-academy.co.uk). No manual publish step is needed.
