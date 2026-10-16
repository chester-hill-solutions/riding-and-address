import { DEFAULT_FREE_MONTHLY_ALLOWANCE } from './customer';
import type { Env } from './types';
import { parseSheet, quoteUpload, csvCell, type UploadJob, type SheetRow, type SheetResult } from './upload-sheet';
import { utcMonth } from './time';
import { performExpandedLookup } from './lookup-expansion';
import { cachedLookupRiding } from './riding-lookup';
import { geocodeIfNeeded } from './geocoding';

const jobKey = (id: string) => `upload:job:${id}`;
const chunkKey = (id: string, index: number) => `upload:input:${id}:${Math.floor(index / 10).toString().padStart(5, '0')}`;
const resultKey = (id: string, index: number) => `upload:result:${id}:${index.toString().padStart(5, '0')}`;
const RETENTION = 7 * 86400_000;

/** Lives in the SAME per-customer DO as the API allowance: no cookie/IP-based free counters. */
export class UploadJobs {
  constructor(private state: DurableObjectState, private env: Env) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url), id = url.searchParams.get('id') ?? '';
    try {
      if (url.pathname === '/uploads/list') {
        const jobs = [...(await this.state.storage.list<UploadJob>({ prefix: 'upload:job:' })).values()];
        const credits = await this.state.storage.get<number>('upload:credits') ?? 0;
        return Response.json({ jobs: jobs.sort((a, b) => b.createdAt - a.createdAt), credits });
      }
      if (url.pathname === '/uploads/create' && request.method === 'POST') {
        const { text, name, freeEligible } = await request.json() as { text: string; name: string; freeEligible: boolean };
        return Response.json(await this.create(text, name, freeEligible));
      }
      const job = await this.get(id);
      if (url.pathname === '/uploads/get') return Response.json(job);
      if (url.pathname === '/uploads/download') return this.download(job);
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      if (url.pathname === '/uploads/start') {
        const body = await request.json() as { sessionId?: string; customerId?: string; expiresAt?: number };
        await this.state.storage.transaction(async txn => {
          const current = await txn.get<UploadJob>(jobKey(id));
          if (!current || !['quoted', 'checkout'].includes(current.status) || current.expiresAt <= Date.now()) throw new Error('This quote has expired. Upload the sheet again.');
          if (current.chargeCents > 0) {
            if (!body.sessionId || !body.customerId) throw new Error('Checkout is required.');
            if (current.checkoutSessionId && current.checkoutSessionId !== body.sessionId) throw new Error('Checkout already exists.');
            current.checkoutSessionId = body.sessionId; current.stripeCustomerId = body.customerId;
            current.status = 'checkout';
            if (body.expiresAt) current.expiresAt = body.expiresAt;
          } else current.status = 'processing';
          await txn.put(jobKey(id), current);
          await txn.setAlarm(current.status === 'processing' ? Date.now() + 100 : current.expiresAt + 1000);
        });
        return Response.json(await this.get(id));
      }
      if (url.pathname === '/uploads/paid') {
        await this.activate(id, await request.json());
        return Response.json({ ok: true });
      }
      if (url.pathname === '/uploads/cancel') {
        // Once a Checkout exists only Stripe's confirmed expiry may release its reservation.
        if (job.status !== 'quoted') throw new Error('This upload can no longer be cancelled here.');
        await this.expire(job); return Response.json({ ok: true });
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload unavailable';
      return Response.json({ error: message }, { status: message.startsWith('Upload not found') ? 404 : 400 });
    }
  }

  private async get(id: string): Promise<UploadJob> {
    const job = await this.state.storage.get<UploadJob>(jobKey(id));
    if (!job) throw new Error('Upload not found. Results are kept for seven days.');
    return job;
  }

  private async create(text: string, name: string, freeEligible: boolean): Promise<UploadJob> {
    const sheet = parseSheet(text), id = crypto.randomUUID(), now = Date.now(), month = utcMonth(now);
    // One quote/job at a time per customer also bounds storage and provider load.
    if (await this.state.storage.get('upload:active')) throw new Error('Finish or cancel your current upload first.');
    const dayKey = `upload:day:${new Date(now).toISOString().slice(0, 10)}`;
    if ((await this.state.storage.get<number>(dayKey) ?? 0) >= 20) throw new Error('Daily upload limit reached. Try again tomorrow or contact support for bulk processing.');
    try {
      for (let i = 0; i < sheet.rows.length; i += 10) await this.state.storage.put(chunkKey(id, i), sheet.rows.slice(i, i + 10));
      const job = await this.state.storage.transaction(async txn => {
        if (await txn.get('upload:active')) throw new Error('Another upload is already in progress.');
        const attempts = await txn.get<number>(dayKey) ?? 0;
        if (attempts >= 20) throw new Error('Daily upload limit reached. Try again tomorrow or contact support for bulk processing.');
        await txn.put(dayKey, attempts + 1);
        const used = await txn.get<number>(`month:${month}`) ?? 0;
        const credits = await txn.get<number>('upload:credits') ?? 0;
        const quote = quoteUpload(sheet.validRows, used, credits, freeEligible ? DEFAULT_FREE_MONTHLY_ALLOWANCE : 0);
        const job: UploadJob = { ...quote, id, name: String(name).slice(0, 120), month,
          createdAt: now, expiresAt: now + 30 * 60_000, status: 'quoted',
          totalRows: sheet.rows.length, validRows: sheet.validRows, invalidRows: sheet.invalidRows,
          headers: sheet.headers, nextRow: 0, successfulRows: 0, creditedRows: 0 };
        await txn.put({ [jobKey(id)]: job, 'upload:active': id, 'upload:credits': credits - quote.creditsUsed,
          [`month:${month}`]: used + sheet.validRows });
        await txn.setAlarm(now + 30 * 60_000);
        return job;
      });
      return job;
    } catch (error) {
      for (let i = 0; i < sheet.rows.length; i += 10) await this.state.storage.delete(chunkKey(id, i));
      throw error;
    }
  }

  private async activate(id: string, session: unknown): Promise<void> {
    if (!session || typeof session !== 'object') throw new Error('Invalid checkout');
    const checkout = session as { id?: string; mode?: string; customer?: string | { id: string }; payment_status?: string; amount_total?: number; currency?: string };
    await this.state.storage.transaction(async txn => {
      const job = await txn.get<UploadJob>(jobKey(id));
      const customer = typeof checkout.customer === 'string' ? checkout.customer : checkout.customer?.id;
      if (!job || job.checkoutSessionId !== checkout.id || job.stripeCustomerId !== customer || checkout.mode !== 'payment' ||
          checkout.payment_status !== 'paid' || checkout.amount_total !== job.chargeCents || checkout.currency !== 'usd') throw new Error('Checkout does not match this upload.');
      if (job.status === 'processing' || job.status === 'completed') return; // webhook retries are harmless
      if (job.status !== 'checkout') throw new Error('Upload is not awaiting payment.');
      const credits = await txn.get<number>('upload:credits') ?? 0;
      await txn.put({ [jobKey(id)]: { ...job, status: 'processing' }, 'upload:credits': credits + job.extraCreditRows });
      await txn.setAlarm(Date.now() + 100);
    });
  }

  private async expire(job: UploadJob): Promise<void> {
    await this.state.storage.transaction(async txn => {
      const current = await txn.get<UploadJob>(jobKey(job.id));
      if (!current || !['quoted', 'checkout'].includes(current.status)) return;
      const used = await txn.get<number>(`month:${current.month}`) ?? 0;
      const credits = await txn.get<number>('upload:credits') ?? 0;
      await txn.put({ [jobKey(job.id)]: { ...current, status: 'expired' },
        [`month:${current.month}`]: Math.max(0, used - current.validRows), 'upload:credits': credits + current.creditsUsed });
      await txn.delete('upload:active');
    });
  }

  /** Resumes from durable per-row progress after restarts; settlement is atomic and idempotent. */
  async alarm(): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + 60_000); // persist recovery before external I/O
    const active = await this.state.storage.get<string>('upload:active');
    if (active) {
      let job = await this.get(active);
      if (job.status === 'quoted' && job.expiresAt <= Date.now()) await this.expire(job);
      else if (job.status === 'checkout' && job.expiresAt <= Date.now()) {
        const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${job.checkoutSessionId}`, {
          headers: { Authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error('Could not confirm checkout status');
        const session = await response.json() as { status: string; payment_status: string };
        if (session.status === 'complete' && session.payment_status === 'paid') await this.activate(job.id, session);
        else if (session.status === 'expired') await this.expire(job);
      } else if (job.status === 'processing') {
        for (let n = 0; n < 5 && job.nextRow < job.totalRows; n++) {
          const index = job.nextRow;
          const chunk = await this.state.storage.get<SheetRow[]>(chunkKey(job.id, index));
          const row = chunk?.[index % 10];
          if (!row) throw new Error('Upload input is unavailable'); // infrastructure failure: retain and retry, never silently lose work
          let result: SheetResult;
          if (row.error) result = { status: 'invalid', error: row.error };
          else {
            try {
              const expanded = await performExpandedLookup(this.env, '/api/federal', row.query, cachedLookupRiding, { geocodeIfNeeded });
              result = expanded.riding ? { status: 'matched', riding: expanded.riding,
                lat: expanded.point.lat, lon: expanded.point.lon } :
                { status: 'unresolved', error: 'No riding matched this row' };
            } catch { result = { status: 'unresolved', error: 'Could not resolve this row' }; }
          }
          await this.state.storage.transaction(async txn => {
            const current = await txn.get<UploadJob>(jobKey(job.id));
            if (!current || current.status !== 'processing' || current.nextRow !== index) return;
            current.nextRow++;
            if (result.status === 'matched') current.successfulRows++;
            await txn.put({ [resultKey(job.id, index)]: result, [jobKey(job.id)]: current });
          });
          job = await this.get(job.id);
        }
        if (job.nextRow === job.totalRows) await this.settle(job.id);
      }
    }
    await this.scheduleAndPrune();
  }

  private async settle(id: string) {
    await this.state.storage.transaction(async txn => {
      const job = await txn.get<UploadJob>(jobKey(id));
      if (!job || job.status !== 'processing' || job.nextRow !== job.totalRows) return;
      const failed = job.validRows - job.successfulRows;
      const creditedRows = job.paidRows - Math.max(0, job.successfulRows - job.freeRows);
      const credits = await txn.get<number>('upload:credits') ?? 0;
      const count = await txn.get<number>(`month:${job.month}`) ?? 0;
      await txn.put({ [jobKey(id)]: { ...job, status: 'completed', creditedRows },
        'upload:credits': credits + creditedRows, [`month:${job.month}`]: Math.max(0, count - failed) });
      await txn.delete('upload:active');
    });
  }

  private async scheduleAndPrune() {
    const jobs = [...(await this.state.storage.list<UploadJob>({ prefix: 'upload:job:' })).values()];
    const days = await this.state.storage.list({ prefix: 'upload:day:' });
    for (const key of days.keys()) if (key.slice('upload:day:'.length) < new Date(Date.now() - RETENTION).toISOString().slice(0, 10)) await this.state.storage.delete(key);
    let next = Infinity;
    for (const job of jobs) {
      if (['processing', 'checkout', 'quoted'].includes(job.status)) {
        next = Math.min(next, job.status === 'processing' ? Date.now() + 1000 : Math.max(Date.now() + 60_000, job.expiresAt));
      } else if (job.createdAt + RETENTION <= Date.now()) {
        for (const prefix of [`upload:input:${job.id}:`, `upload:result:${job.id}:`]) {
          while (true) {
            const keys = [...(await this.state.storage.list({ prefix, limit: 128 })).keys()];
            if (!keys.length) break;
            await this.state.storage.delete(keys);
          }
        }
        await this.state.storage.delete(jobKey(job.id));
      } else next = Math.min(next, job.createdAt + RETENTION);
    }
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next);
    else await this.state.storage.deleteAlarm();
  }

  private async download(job: UploadJob): Promise<Response> {
    if (job.status !== 'completed') throw new Error('Results are not ready yet.');
    const extra = ['cancoder_status', 'cancoder_riding', 'cancoder_latitude', 'cancoder_longitude', 'cancoder_error'];
    const lines = [[...job.headers, ...extra].map(csvCell).join(',')];
    for (let i = 0; i < job.totalRows; i += 10) {
      const chunk = await this.state.storage.get<SheetRow[]>(chunkKey(job.id, i));
      if (!chunk) throw new Error('Upload expired');
      const results = await this.state.storage.get<SheetResult>(chunk.map((_, j) => resultKey(job.id, i + j)));
      chunk.forEach((row, j) => {
        const result = results.get(resultKey(job.id, i + j));
        lines.push([...job.headers.map(h => row.source[h]), result?.status, result?.riding, result?.lat, result?.lon, result?.error].map(csvCell).join(','));
      });
    }
    return new Response('\uFEFF' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="cancoder-results.csv"', 'Cache-Control': 'private, no-store' } });
  }
}
