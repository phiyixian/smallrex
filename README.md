# VoltScope EV Fault Analyzer

Upload EV charger images/videos, run AI fault identification, and store results in Supabase for dashboard analytics.

## What is implemented

- Upload image or video and extract video frames for analysis.
- AI provider selection: `OpenAI`, `Gemini`, `Roboflow Model`.
- Fault taxonomy coverage:
  - Isolator
  - TNB Power Supply
  - Charger
  - EV Distribution Board
- Returned analysis includes:
  - Fault category
  - Observation
  - Fault type
  - Follow-up action
  - Annotation boxes (drawn on media)
  - Processing time
  - Token usage
  - Estimated cost/performance metrics
- Dashboard for usage stats, distribution, confidence/accuracy trend, and provider performance.
- Supabase integration for storing uploads and analysis history.

## Run in VS Code

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `copy .env.example .env` (Windows PowerShell)
3. Fill `.env` with your real keys.
4. Start app:
   - `npm run dev`
5. Open in browser:
   - `http://localhost:3000` (or terminal output port)

You can also use:

- VS Code Run and Debug -> `Run Vite Dev Server`
- VS Code Tasks -> `dev`, `build`, `lint`

## Environment variables

Client + server:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET` (default: `ev-uploads`)
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Server-only AI keys:

- `OPENAI_API_KEY`
- `OPENAI_VISION_MODEL` (default: `gpt-4o-mini`)
- `GEMINI_API_KEY`
- `GEMINI_VISION_MODEL` (default: `gemini-2.5-flash`)
- `ROBOFLOW_API_KEY`

Optional backend admin key:

- `SUPABASE_SERVICE_ROLE_KEY`

## Database setup (Supabase)

1. Create a Supabase project.
2. Run migrations in `supabase/migrations`.
3. Ensure storage bucket `ev-uploads` exists and RLS policies are applied.
4. Confirm `analyses` table exists and accepts inserts.

Quick SQL to create the bucket manually if needed:

```sql
insert into storage.buckets (id, name, public)
values ('ev-uploads', 'ev-uploads', true)
on conflict (id) do nothing;
```

## Security notes (GitHub-safe)

- `.env` is ignored by git.
- Only `.env.example` is committed.
- AI provider keys are used server-side through TanStack server functions.
- Client only sees uploaded media public URLs and analysis results.
- Public updates/deletes were removed from policies for safer default behavior.

## Project scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run lint` - lint codebase
- `npm run format` - format codebase
