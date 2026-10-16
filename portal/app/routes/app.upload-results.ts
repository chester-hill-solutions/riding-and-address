import type { Route } from './+types/app.upload-results';
import { requireCustomer } from '~/lib/customer.server';
import { uploadStub } from '~/lib/upload.server';

/** Resource route: return CSV bytes directly, without rendering the portal layout. */
export async function loader({ request, url, params }: Route.LoaderArgs) {
  const { billing } = await requireCustomer(request, url);
  return uploadStub(billing.customerId).fetch(`https://usage/uploads/download?id=${encodeURIComponent(params.id)}`);
}
