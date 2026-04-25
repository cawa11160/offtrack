# offtrack frontend

This is the React frontend for offtrack, a music discovery and listening app.

## Tech Stack

- Vite
- TypeScript
- React
- shadcn/ui
- Tailwind CSS

## Local Development

Install dependencies:

```sh
npm install
```

Start the dev server:

```sh
npm run dev
```

The dev server runs on `http://localhost:8080` and proxies `/api/*` to the backend at `http://localhost:8000` by default.

## Environment

Copy `.env.example` to `.env.local` when local overrides are needed.

```sh
VITE_API_BASE_URL=
VITE_MAPBOX_TOKEN=
VITE_TICKETMASTER_API_KEY=
VITE_DEFAULT_EVENT_CITY=New York
VITE_DEFAULT_EVENT_STATE_CODE=NY
VITE_DEFAULT_EVENT_COUNTRY_CODE=US
```

For a different local backend target, set `VITE_API_PROXY_TARGET` before starting Vite.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build.
- `npm run build:dev` creates a development-mode build.
- `npm run lint` runs ESLint.
- `npm run preview` serves the built frontend locally.

## Build

```sh
npm run build
```
