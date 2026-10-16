import { Form, Link, redirect } from 'react-router';
import type { Route } from './+types/app.upload';
import { requireCustomer, requireOwnerOrAdmin } from '~/lib/customer.server';
import { uploadCall, uploadIdentity, UploadServiceError } from '~/lib/upload.server';
import { getStripe, createUploadCheckoutSession } from '~/lib/stripe.server';
import { linkStripeCustomer } from '~/lib/billing-mutations.server';
import { env } from '~/lib/env.server';
import { Panel } from '~/components/Panel';
import { SubmitButton } from '~/components/SubmitButton';
import { uploadForm } from '~/lib/upload-form.server';
import { FormFeedback } from '~/components/FormFeedback';
import type { UploadJob } from '../../../src/upload-sheet';

const dollars = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' }).format(cents / 100);
export async function loader({ request, url, params }: Route.LoaderArgs) {
  const { billing } = await requireCustomer(request, url);
  try { return { job: await uploadCall<UploadJob>(billing.customerId, 'get', params.id), paidEnabled: env().uploadCheckoutEnabled }; }
  catch (error) { if (error instanceof UploadServiceError && error.status === 404) throw new Response('Upload not found', { status: 404 }); throw error; }
}
export async function action({ request, url, params }: Route.ActionArgs) {
  const { userId, billing, membership } = await requireCustomer(request, url);
  requireOwnerOrAdmin(membership);
  const form = await uploadForm(request);
  try {
    if (form.get('intent') === 'cancel') {
      await uploadCall(billing.customerId, 'cancel', params.id, {}); return redirect('/app/uploads');
    }
    if (!(await uploadIdentity(userId)).verified) throw new Error('Verify your email before starting an upload.');
    const job = await uploadCall<UploadJob>(billing.customerId, 'get', params.id);
    if (job.status === 'processing' || job.status === 'completed') return redirect(`/app/uploads/${job.id}`);
    if (job.status === 'expired' || job.expiresAt <= Date.now()) throw new Error('This quote expired. Upload the sheet again.');
    if (!job.chargeCents) { await uploadCall(billing.customerId, 'start', job.id, {}); return redirect(`/app/uploads/${job.id}`); }
    const stripe = getStripe();
    if (!stripe || !env().uploadCheckoutEnabled) throw new Error('Paid uploads are not enabled yet.');
    let customerId = billing.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { customerId: billing.customerId, workspaceId: billing.workspaceId } }, { idempotencyKey: `upload-customer:${billing.customerId}` });
      customerId = customer.id;
      await linkStripeCustomer({ workspaceId: billing.workspaceId, stripeCustomerId: customerId });
    }
    const session = await createUploadCheckoutSession({ id: job.id, customerId: billing.customerId,
      stripeCustomerId: customerId, chargeCents: job.chargeCents, returnUrl: `${env().baseUrl}/app/uploads/${job.id}`, expiresAt: Math.floor(job.createdAt / 1000) + 3600 });
    if (!session.url) throw new Error('Could not open Checkout.');
    await uploadCall(billing.customerId, 'start', job.id, { sessionId: session.id, customerId, expiresAt: session.expires_at * 1000 });
    return redirect(session.url);
  } catch (error) { return { error: error instanceof Error ? error.message : 'Could not start this upload.' }; }
}
export default function Upload({ loaderData, actionData }: Route.ComponentProps) {
  const { job, paidEnabled } = loaderData;
  const running = job.status === 'processing';
  return <Panel title={job.name}>
    {running ? <meta httpEquiv="refresh" content="5" /> : null}
    <Link to="/app/uploads">← Uploads</Link>
    <FormFeedback error={actionData?.error} />
    <p className="page-intro">{job.totalRows.toLocaleString()} rows · {job.status === 'quoted' ? 'Ready for review' : job.status}</p>
    {job.status === 'quoted' || job.status === 'checkout' ? <>
      <div className="upload-quote"><h2>Your upload quote</h2><dl><dt>Usable rows</dt><dd>{job.validRows.toLocaleString()}</dd><dt>Invalid rows skipped at no charge</dt><dd>{job.invalidRows.toLocaleString()}</dd><dt>Free rows this month</dt><dd>{job.freeRows.toLocaleString()}</dd><dt>Existing credits applied</dt><dd>{job.creditsUsed.toLocaleString()} rows</dd><dt>Rows to pay for</dt><dd>{(job.paidRows - job.creditsUsed).toLocaleString()}</dd><dt>Credit retained after payment</dt><dd>{job.extraCreditRows.toLocaleString()} rows</dd><dt className="quote-total">Total due now</dt><dd className="quote-total">{dollars(job.chargeCents)} USD</dd></dl></div>
      <p className="field-hint">A one-time payment for this upload. No recurring charge. The US$0.50 card minimum and fractional-cent rounding stay as row credits. Unresolved paid rows are credited automatically.</p>
      <Form method="post"><input type="hidden" name="intent" value="start" /><SubmitButton isDisabled={Boolean(job.chargeCents && !paidEnabled)} pendingText="Starting…">{job.chargeCents ? `Pay ${dollars(job.chargeCents)} USD & process` : 'Process upload free'}</SubmitButton></Form>
      {job.status === 'quoted' ? <Form method="post"><input type="hidden" name="intent" value="cancel" /><SubmitButton variant="secondary">Cancel upload</SubmitButton></Form> : <p className="field-hint">If you leave Checkout without paying, the reservation is released once Stripe confirms that the checkout has expired.</p>}
    </> : running ? <div className="upload-progress" role="status"><h2>Processing your sheet</h2><progress value={job.nextRow} max={job.totalRows} aria-label="Rows processed" /><p>{job.nextRow.toLocaleString()} of {job.totalRows.toLocaleString()} rows processed. You can close this page and return later.</p></div> : job.status === 'completed' ? <div><h2>Your results are ready</h2><p>{job.successfulRows.toLocaleString()} successful rows. {job.creditedRows.toLocaleString()} {job.creditedRows === 1 ? 'paid row was' : 'paid rows were'} credited back to your account.</p><a className="upload-download" href={`/app/uploads/${job.id}/results.csv`}>Download results CSV</a><p className="field-hint">Original columns are preserved. Added columns show the riding, coordinates and result status.</p></div> : <p>This quote expired. Your reserved allowance and credits have been returned. <Link to="/app/uploads">Upload again</Link></p>}
  </Panel>;
}
