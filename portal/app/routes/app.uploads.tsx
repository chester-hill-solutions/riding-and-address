import { Form, Link, redirect } from 'react-router';
import type { Route } from './+types/app.uploads';
import { requireCustomer, requireOwnerOrAdmin, isOwnerOrAdmin } from '~/lib/customer.server';
import { claimFreeAllowance, uploadCall, uploadIdentity, type UploadList } from '~/lib/upload.server';
import { getAuth } from '~/lib/auth.server';
import { env } from '~/lib/env.server';
import { uploadForm } from '~/lib/upload-form.server';
import { Panel } from '~/components/Panel';
import { SubmitButton } from '~/components/SubmitButton';
import { FormFeedback } from '~/components/FormFeedback';
import { MAX_SHEET_BYTES, type UploadJob } from '../../../src/upload-sheet';
import { formatMeteredUnitPrice } from '~/lib/pricing';

export async function loader({ request, url }: Route.LoaderArgs) {
  const { userId, billing, membership } = await requireCustomer(request, url);
  const identity = await uploadIdentity(userId);
  const uploads = await uploadCall<UploadList>(billing.customerId, 'list');
  return { ...uploads, verified: identity.verified, canUpload: isOwnerOrAdmin(membership) };
}
export async function action({ request, url }: Route.ActionArgs) {
  const { userId, billing, membership } = await requireCustomer(request, url);
  const form = await uploadForm(request);
  try {
    if (form.get('intent') === 'verify') {
      const identity = await uploadIdentity(userId);
      await getAuth().api.sendVerificationEmail({ body: { email: identity.email, callbackURL: env().baseUrl + '/app/uploads' }, headers: request.headers });
      return { success: 'Check your inbox for a verification link.' };
    }
    requireOwnerOrAdmin(membership);
    const freeEligible = await claimFreeAllowance(userId, billing.customerId);
    const file = form.get('sheet');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv') || file.size > MAX_SHEET_BYTES) return { error: 'Choose a CSV file up to 1 MiB. Export Excel or Google Sheets as CSV first.' };
    const job = await uploadCall<UploadJob>(billing.customerId, 'create', '', { text: await file.text(), name: file.name, freeEligible });
    return redirect(`/app/uploads/${job.id}`);
  } catch (error) { return { error: error instanceof Error ? error.message : 'Could not prepare the upload.' }; }
}
export default function Uploads({ loaderData, actionData }: Route.ComponentProps) {
  const { jobs, credits, verified, canUpload } = loaderData;
  const active = jobs.find(job => ['quoted', 'checkout', 'processing'].includes(job.status));
  return <Panel title="Upload a sheet">
    <p className="page-intro">Add addresses or postal codes. Review the price, pay once, then download your results.</p>
    <FormFeedback error={actionData && 'error' in actionData ? actionData.error : null} success={actionData && 'success' in actionData ? actionData.success : null} />
    <div className="upload-facts"><p><strong>1,000 free rows</strong><span>Shared by your workspace each month</span></p><p><strong>{formatMeteredUnitPrice()} USD</strong><span>Per successful row after the allowance</span></p><p><strong>{credits.toLocaleString()} row credits</strong><span>Applied automatically to your next upload</span></p></div>
    {!verified ? <div className="notice"><h2>Verify your email first</h2><p>Your free allowance follows your verified account across browsers and private windows.</p><Form method="post"><input type="hidden" name="intent" value="verify" /><SubmitButton pendingText="Sending…">Send verification email</SubmitButton></Form></div> :
      !canUpload ? <p className="notice">An owner or admin can upload and approve payments.</p> :
      active ? <p className="notice">You have an upload in progress. <Link to={`/app/uploads/${active.id}`}>Open {active.name}</Link></p> :
      <Form method="post" encType="multipart/form-data" className="upload-form"><label htmlFor="sheet">Address spreadsheet</label><input id="sheet" name="sheet" type="file" accept=".csv,text/csv" required aria-describedby="sheet-help" /><p id="sheet-help" className="field-hint">CSV · up to 1 MiB and 10,000 rows. Include address, postal_code, or latitude and longitude columns. Other columns are preserved.</p><SubmitButton pendingText="Preparing quote…">Review upload & price</SubmitButton></Form>}
    <p className="field-hint">No subscription. Failed paid rows become account credit. A paid card transaction has a US$0.50 minimum; the remainder stays as credit. Files and results are removed after seven days. Up to 20 uploads per workspace per day.</p>
    {jobs.length > 0 ? <section className="upload-history"><h2>Recent uploads</h2><ul>{jobs.map(job => <li key={job.id}><Link to={`/app/uploads/${job.id}`}>{job.name}</Link><span>{job.totalRows.toLocaleString()} rows · {job.status}</span></li>)}</ul></section> : null}
  </Panel>;
}
