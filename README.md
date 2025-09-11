<h1 align="center"">EscrowPi</h1>

<div align="center">

[![Hackathon](https://img.shields.io/badge/hackathon-PiCommerce-purple.svg)](https://github.com/pi-apps/PiOS/blob/main/pi-commerce.md)
![Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-PIOS-blue.svg)

</div>

<div>
    <p align="justify"><b>EscrowPi</b> is a prototype payment solution designed for the Pi Hackathon. It provides a simple escrow-based payment flow that enables secure transactions between buyers and sellers using Pi.</p>
</div>

## Table of Contents

- [Brand Design](#brand-design)
- [Tech Stack](#tech-stack)
- [Frontend Local Execution](#frontend-local-execution)
- [Team](#team)
- [Contributions](#contributions)

## <a name='brand-design'></a>Brand Design

| App Logo  | App Icon |
| ------------- |:-------------:|
| <img src="https://i.ibb.co/fYS0ZjVZ/escrow-pi-logo-design.png" alt="escrow-pi-logo" border="0">     | <img src="https://i.ibb.co/fYS0ZjVZ/escrow-pi-logo-design.png" alt="escrow-pi-logo" border="0">

## <a name='tech-stack'></a>Tech Stack 📊

- **Frontend**: NextJS/ React, TypeScript, Tailwind + MUI
- **Backend**: Express/ NodeJS, REST API
- **Database**: MongoDB
- **DevOps**: GitHub Actions

## Project Structure
- `src/app/` – App Router pages
- `src/components/` – shared UI components
- `public/` – static assets

## <a name='frontend-local-execution'></a>Frontend Local Execution

The EscrowPi Front End is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) which is a React framework to build web applications. **Prerequisite**: Node 18+

### Install Dependencies
```bash
npm install
```

### Build the Project

- Run `npm run build` to build the project; builds the app for production to the `.next` folder.
    - The build artifacts are bundled for production mode and optimized for the best performance.

### Execute the Development Server

- Create .env.local file from the .env.development template and replace placeholders with actual values.
- Execute `npm run dev` to spin up a dev server.
- Navigate to http://localhost:4300/ in your browser.
- Execute **[Backend Local Execution](https://github.com/map-of-pi/map-of-pi-backend-react/blob/dev/README.md#backend-local-execution)** for integration testing. 
    - The application will automatically reload if you change any of the source files.
    - For local debugging in VS Code, attach the runtime server accordingly.
    - Lint errors will be displayed in the console.

### Build + Start
```bash
npm run build
npm start
```

### Execute Unit Tests

- Run `npm run test` to execute the unit tests via [Jest](https://jestjs.io/) + Testing Library with jsdom.
- Files:
  - `jest.config.ts` – Jest configuration (jsdom, ts-jest transform, CSS/file mocks)
  - `jest.setup.ts` – Testing Library jest-dom setup
  - `src/__tests__/smoke.test.tsx` – basic smoke test

## <a name='team'></a>Team 🧑👩‍🦱🧔👨🏾‍🦱👨🏾 

### Project Manager
- Philip Jennings

### Technical Lead/ DevOps
- Danny Lee

### Application Developers
- Yusuf Adisa
- Rajasekhar Reddy

## <a name='contributions'></a>Contributions

<div>
    <p align="justify">We welcome contributions from the community to improve the EscrowPi project.</p>
</div>
