# EscrowPi Frontend

A Next.js (App Router) + TypeScript + Tailwind + MUI app for EscrowPi.

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- TailwindCSS
- MUI
- React 18
- react-toastify

## Getting Started

Prerequisites: Node 18+

Install dependencies:

```bash
npm install
```

Run dev server (http://localhost:4300):

```bash
npm run dev
```

Build and start:

```bash
npm run build
npm start
```

## Testing

We use Jest + Testing Library with jsdom.

- Run tests:

```bash
npm test
```

- Files:
  - `jest.config.ts` – Jest configuration (jsdom, ts-jest transform, CSS/file mocks)
  - `jest.setup.ts` – Testing Library jest-dom setup
  - `src/__tests__/smoke.test.tsx` – basic smoke test

## Project Structure

- `src/app/` – App Router pages
- `src/components/` – shared UI components
- `public/` – static assets

## Notes

- Backend integration points are marked with TODO comments.
- UI colors and header mirror the Map-of-Pi project.
