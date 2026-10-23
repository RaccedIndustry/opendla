// DIBBS answers every URL with a DoD Notice and Consent banner until its form is
// posted back (the "OK" click). Consent lives in cookies, separately for each host:
// www. serves pages, dibbs2. serves files.

export const RFQ_DATES_URL =
  'https://www.dibbs.bsm.dla.mil/Rfq/RfqDates.aspx?category=recent';

const jars = new Map<string, Map<string, string>>();

/** One request with this host's cookies. No auto-redirects, so cookies set on 302s are kept too. */
async function send(url: string, init?: RequestInit): Promise<Response> {
  const host = new URL(url).host;
  const jar = jars.get(host) ?? new Map<string, string>();
  jars.set(host, jar);
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { cookie },
  });
  for (const setCookie of res.headers.getSetCookie()) {
    const pair = setCookie.split(';')[0];
    const eq = pair.indexOf('=');
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return res;
}

/** GET, following redirects by hand. Stops at a plain-http redirect: that's DIBBS's FileNotFound page. */
async function get(url: string): Promise<{ res: Response; url: string }> {
  for (let hops = 0; hops < 5; hops++) {
    const res = await send(url);
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return { res, url };
    const next = new URL(location, url);
    if (next.protocol !== 'https:') return { res, url };
    await res.body?.cancel();
    url = next.href;
  }
  throw new Error(`Too many redirects from ${url}`);
}

/** The consent banner's form, ready to post back: every hidden field plus the OK button. */
export function consentForm(html: string, pageUrl: string) {
  const action = /<form[^>]*\saction="([^"]+)"/i.exec(html)?.[1];
  if (!action || !html.includes('name="butAgree"')) return null;
  const fields = html.matchAll(
    /<input type="hidden" name="([^"]+)"[^>]*\svalue="([^"]*)"/g,
  );
  const body = new URLSearchParams(
    [...fields].map(([, name, value]) => [name, value]),
  );
  body.set('butAgree', 'OK');
  return {
    action: new URL(action.replaceAll('&amp;', '&'), pageUrl).href,
    body,
  };
}

/** GET a DIBBS URL, clicking through the consent banner if it shows up instead. */
export async function dibbsGet(target: string): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { res, url } = await get(target);
    if (!res.headers.get('content-type')?.includes('text/html')) return res;
    const html = await res.text();
    const form = consentForm(html, url);
    if (!form)
      return new Response(html, { status: res.status, headers: res.headers });
    const posted = await send(form.action, { method: 'POST', body: form.body });
    await posted.body?.cancel();
  }
  throw new Error(`DIBBS consent banner did not clear for ${target}`);
}

/** The ca{yymmdd}.zip links on the RFQ dates page, newest first. */
export function listArchives(html: string) {
  return [...html.matchAll(/'(https:\/\/[^']+\/ca(\d\d)(\d\d)(\d\d)\.zip)'/gi)]
    .map(([, fileUrl, yy, mm, dd]) => ({
      fileUrl,
      date: `20${yy}-${mm}-${dd}`,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
