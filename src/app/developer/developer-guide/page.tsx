import Link from 'next/link';
import type { Metadata } from 'next';

import TocNav from './tocNav';

// const DOC_ENV = process.env.NEXT_PUBLIC_DOC_ENV ?? 'dev';
// const DOC_BASE = `https://escrowpi-doc-${DOC_ENV}.vercel.app`;
const DOC_BASE = `http://localhost:4000`;
const SWAGGER_URL = `${DOC_BASE}/api-docs`;
const CONTACT_EMAIL = 'philip@mapofpi.com';

const tocItems = [
  { id: 'prereqs', label: 'Before you start' },
  { id: 'onboarding', label: 'Register your developer app' },
  { id: 'auth', label: 'Authenticate pioneers' },
  { id: 'apis', label: 'EscrowPi developer APIs' },
  { id: 'integration', label: 'Integration walkthrough' },
  { id: 'tracking', label: 'Order tracking & customer updates' },
  { id: 'best-practices', label: 'Best practices & tips' },
  { id: 'resources', label: 'Resources & support' },
];

const apiEndpoints = [
  {
    method: 'GET',
    path: '/api/v1/developer/buttons/pay',
    description: 'Issues a short-lived invocation token and button metadata.',
    notes: ['Requires Pi access token + EscrowPi headers', 'Call from your backend only'],
  },
  {
    method: 'GET',
    path: '/api/v1/developer/buttons/pay/redirect',
    description: 'Builds the signed provider redirect URL for a specific invocation.',
    notes: ['Valid returnUrl origin is mandatory', 'Use the invocationId from the previous step'],
  },
  {
    method: 'POST',
    path: '/api/v1/developer/provider/return/verify',
    description: 'Validates the payload EscrowPi sends back to your return URL.',
    notes: ['Forward the raw query params untouched', 'Persist the orderNo from the verified response'],
  },
  {
    method: 'GET',
    path: '/api/v1/developer/orders/:orderNo',
    description: 'Returns the full order snapshot (amounts, parties, disputes, payout edges).',
    notes: ['Use for dashboards and customer support', 'Subject to developer rate limits'],
  },
  {
    method: 'GET',
    path: '/api/v1/developer/fees',
    description: 'Provides the current fee configuration EscrowPi applies to your app.',
    notes: ['Great for displaying fees to users before checkout', 'Requires EscrowPi developer context'],
  },
  {
    method: 'POST',
    path: '/api/v1/developer/developer-fees',
    description: 'Retrieves fee policy and fee calculation for the given Pi amount',
    notes: ['Great for displaying calculated fee for users before checkout', 'Requires EscrowPi developer context'],
  },
];

const integrationSteps = [
  {
    title: '1. Obtain a Pi access token',
    detail:
      'Load Pi SDK and call Pi.authenticate (username, payments, wallet_address). Send the resulting token to your backend over HTTPS and refresh when it expires.',
  },
  {
    title: '2. Issue an invocation token',
    detail:
      'From your backend call GET /api/v1/developer/buttons/pay with the Pi token and EscrowPi headers. Use the invocationId and expiresAt for further API calls.',
  },
  {
    title: '3. Build the provider redirect',
    detail:
      'Call GET /api/v1/developer/buttons/pay/redirect with the invocationId, returnUrl, amount, memo, and optional state. EscrowPi signs and returns providerRedirect.url.',
  },
  {
    title: '4. Launch the checkout',
    detail:
      'Open providerRedirect.url inside Pi Browser. The pioneer reviews the escrow amount, terms and confirms or cancels the payment.',
  },
  {
    title: '5. Verify the provider return',
    detail:
      'Capture every query parameter EscrowPi appended to your returnUrl and POST them to /api/v1/developer/provider/return/verify. Persist the verified orderNo + state.',
  },
  {
    title: '6. Track and notify',
    detail:
      'Use /api/v1/developer/orders/:orderNo (and EscrowPi notifications) to keep merchants and pioneers updated until the order is fulfilled and released.',
  },
];

const bestPractices = [
  'Never invoke EscrowPi developer APIs directly from your frontend; proxy everything through your backend.',
  'Store `x-escrowpi-api-key` in a secrets manager or environment variable and rotate it via the Developer Portal if exposure is suspected.',
  'Validate every returnUrl against your own allowlist before forwarding to EscrowPi to avoid phishing vectors.',
  'Cache invocation tokens per checkout session; if the user restarts, request a fresh token instead of reusing expired ones.',
  'Log the `state` payload you send to EscrowPi so you can reconcile orders with your internal IDs instantly.',
  'Surface order progress inside your app even though EscrowPi already notifies users—mirroring the timeline reduces support tickets.',
];

const codeSample = String.raw`import axios from 'axios';

const ESCROWPI_BASE_URL = 'https://escrowpiwallet.com/api/v1';
const ESCROWPI_APP_ID = process.env.ESCROWPI_APP_ID!;
const ESCROWPI_API_KEY = process.env.ESCROWPI_API_KEY!;

export async function createProviderRedirect({
  piAccessToken,
  returnUrl,
  state,
  amount,
  memo,
}) {
  const client = axios.create({
    baseURL: ESCROWPI_BASE_URL,
    headers: {
      'x-escrowpi-app-id': ESCROWPI_APP_ID,
      'x-escrowpi-api-key': ESCROWPI_API_KEY,
      Authorization: \`Bearer \${piAccessToken}\`,
    },
  });

  const { data: button } = await client.get('/developer/buttons/pay');
  const invocationId = button?.invocationId;
  if (!invocationId) {
    throw new Error('Unable to issue invocation');
  }

  const { data: redirect } = await client.get('/developer/buttons/pay/redirect', {
    params: {
      invocationId,
      returnUrl,
      state: JSON.stringify(state),
      amount,
      memo,
    },
  });

  return redirect?.providerRedirect?.url;
}
`;

export const metadata: Metadata = {
  title: 'Developer Guide | EscrowPi',
  description: 'Step-by-step instructions to register your developer app, integrate Pay with EscrowPi, and keep users informed.',
};

export default function DeveloperGuidePage() {
  return (
    <div
      className="bg-white text-slate-900"
      style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)', overflowX: 'hidden' }}
    >
      <div className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-12 xl:px-16 lg:py-16">
        <div className="flex flex-col gap-10 lg:flex-row">
          <aside className="h-max rounded-2xl border border-slate-200 bg-slate-50 p-6 lg:fixed lg:top-32 lg:w-72">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">On this page</p>
            <TocNav items={tocItems} />
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Need schemas?</p>
              <Link
                href={SWAGGER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center text-sky-700 hover:text-sky-600"
              >
                Swagger / OpenAPI →
              </Link>
              <p className="mt-3 text-xs text-slate-500">Run requests from your backend to keep credentials safe.</p>
            </div>
          </aside>

          <div className="w-full space-y-8 lg:pl-[19.5rem] xl:pl-[21rem]">
            <header className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:-mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Developer guide</p>
              <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Integrate Pay with EscrowPi with your Pi app
              </h1>
              <p className="mt-4 text-lg text-slate-600">
                This developer guide provides the exact steps you need to register, integrate, and operate your checkout flow with EscrowPi.
                You can access this guide outside of Pi Browser and no Pi auth required.
              </p>
              <div className="mt-6 grid gap-4 text-sm text-slate-700 lg:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-semibold text-amber-900">Important</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>All EscrowPi developer APIs must be invoked from your backend service.</li>
                    <li>Keep `x-escrowpi-api-key` server-side; never store it in a Pi app bundle.</li>
                    <li>Only use return URLs that belong to an allowed origin configured in your developer app.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Quick links</p>
                  <ul className="mt-2 space-y-1">
                    <li>
                      <Link href="/developer" className="text-sky-700 hover:text-sky-600">
                        Developer Portal dashboard →
                      </Link>
                    </li>
                    <li>
                      <Link href={SWAGGER_URL} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:text-sky-600">
                        Swagger / OpenAPI reference →
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </header>

            <section id="prereqs" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">01</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Before you start</h2>
              <p className="mt-3 text-slate-600">Line up these requirements so onboarding goes smoothly.</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Your app runs within Pi Browser/Sandbox environment and authenticates users with Pi SDK.
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Company/contact details, product description, compliance notes, and launch timelines for the request form.
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  A vetted list of allowed origins (scheme + host + port) for hosting pay buttons and return URLs.
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Backend service (Node, Go, etc.) with HTTPS support and secret storage for EscrowPi credentials.
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Secret-management process to capture the API key the moment it is revealed (you only see it once).
                </li>
              </ul>
            </section>

            <section id="onboarding" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">02</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Register your developer app</h2>
              <ol className="mt-6 space-y-4 text-sm text-slate-700">
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Open EscrowPi app within Pi browser. Open Developer portal using a Menu option within EscrowPi app.
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Submit a request to create a new app with app metadata, contact email, allowed origins, and any review notes for EscrowPi admins.
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Track review status under “Developer app requests” (`requested → in_progress → approved/rejected`).
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  When approved, reveal the API key directly on the request card and make sure to copy it securely.
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  Need a new key? Submit a rotation request. Once you reveal the replacement, the old key is revoked.
                </li>
              </ol>
            </section>

            <section id="auth" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">03</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Authenticate pioneers through your app</h2>
              <div className="mt-4 grid min-w-0 gap-4 text-sm text-slate-700 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 min-w-0 break-words">
                  <h3 className="text-base font-semibold text-slate-900">Pi SDK flow</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    <li className="break-words">Load Pi SDK; if the pioneer is outside Pi Browser, prompt them to open your app in Pi browser.</li>
                    <li className="break-words">Call <span className="font-mono break-words text-slate-900">Pi.authenticate(['username','payments','wallet_address'])</span>.</li>
                    <li className="break-words">Send the resulting access token + username to your backend over HTTPS and store it in session.</li>
                    <li className="break-words">When Pi returns <span className="font-mono break-words text-slate-900">pi_auth_required</span>, re-run Pi.authenticate to refresh the token.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 min-w-0 break-words">
                  <h3 className="text-base font-semibold text-slate-900">EscrowPi headers checklist</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    <li className="break-words"><span className="font-mono break-words text-slate-900">Authorization: Bearer &lt;pi_access_token&gt;</span></li>
                    <li className="break-words"><span className="font-mono break-words text-slate-900">x-escrowpi-app-id: &lt;your_escrowpi_app_id&gt;</span></li>
                    <li className="break-words"><span className="font-mono break-words text-slate-900">x-escrowpi-api-key: &lt;your_escrowpi_api_key&gt;</span></li>
                    <li className="break-words">Optional: <span className="font-mono break-words text-slate-900">x-pi-username</span> for debugging/logging.</li>
                    <li className="break-words">Never expose the API key to the browser or app client.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section id="apis" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">04</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">EscrowPi developer APIs</h2>
              <p className="mt-3 text-slate-600">
                These core endpoints power every Pay with EscrowPi integration. Call them from your backend using the headers listed above.
              </p>
              <div className="mt-6 grid min-w-0 gap-5 md:grid-cols-2">
                {apiEndpoints.map((api) => (
                  <div key={api.path} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 min-w-0 break-words">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">{api.method}</p>
                    <p className="mt-1 break-words font-mono text-base text-slate-900">{api.path}</p>
                    <p className="mt-3 break-words text-sm text-slate-700">{api.description}</p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
                      {api.notes.map((note) => (
                        <li key={note} className="break-words">{note}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section id="integration" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">05</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Integration walkthrough</h2>
              <div className="mt-6 space-y-4">
                {integrationSteps.map((step) => (
                  <div key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-2 text-sm text-slate-700">{step.detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <div className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Sample backend helper</div>
                <p className="mt-3 text-sm text-slate-700">
                  Use a server-side helper like the snippet below to issue invocation tokens and provider redirects without exposing credentials to the frontend.
                </p>
                <pre className="mt-4 overflow-auto rounded-2xl bg-slate-900/95 p-4 text-sm text-emerald-100">
                  <code>{codeSample}</code>
                </pre>
              </div>
            </section>

            <section id="tracking" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">06</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Order tracking & customer updates</h2>
              <div className="mt-4 grid gap-4 text-sm text-slate-700 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-base font-semibold text-slate-900">Inside EscrowPi</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    <li>Pioneers see every order and status badge inside the EscrowPi wallet UI.</li>
                    <li>Notifications fire automatically for transitions beyond <span className="font-mono text-slate-900">initiated</span>.</li>
                    <li>Dispute actions and outcomes display directly in the order timeline.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-base font-semibold text-slate-900">Inside your app</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    <li>Fetch snapshots via <span className="font-mono text-slate-900">GET /developer/orders/:orderNo</span> and merge with your fulfillment data.</li>
                    <li>Use the <span className="font-mono text-slate-900">state</span> payload you provided earlier to reconcile records instantly.</li>
                    <li>Render progress indicators (`requested → paid → fulfilled → released`) to reduce support tickets.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section id="best-practices" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">07</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Best practices & tips</h2>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {bestPractices.map((tip) => (
                  <li key={tip} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    {tip}
                  </li>
                ))}
              </ul>
            </section>

            <section id="resources" className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">08</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Resources & support</h2>
              <div className="mt-4 grid gap-4 text-sm text-slate-700 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-base font-semibold text-slate-900">EscrowPi contacts</h3>
                  <p className="mt-2">
                    Onboarding or credential questions? Email{' '}
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-700 hover:text-sky-600">
                      {CONTACT_EMAIL}
                    </a>
                    .
                  </p>
                  <p className="mt-2">
                    Production incident? Provide <span className="font-mono text-slate-900">appId</span>, <span className="font-mono text-slate-900">orderNo</span>, timestamps, and Pi usernames to your EscrowPi liaison.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-base font-semibold text-slate-900">Helpful links</h3>
                  <ul className="mt-3 space-y-2">
                    <li>
                      <Link href="/developer" className="text-sky-700 hover:text-sky-600">
                        Developer Portal dashboard →
                      </Link>
                    </li>
                    <li>
                      <Link href={SWAGGER_URL} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:text-sky-600">
                        Swagger / OpenAPI reference →
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
