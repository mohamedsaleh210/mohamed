/**
 * Shared harness for the test suites.
 *
 * Boots the real server against a throwaway database and drives it over HTTP
 * the way a browser would — cookies, CSRF tokens, redirects and all. Pulled out
 * of the main suite so the security scan and any future suite exercise exactly
 * the same application, not a simplified stand-in.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function createHarness({
  port,
  adminPath = '/office-panel',
  seedDemo = true,
  label = 'suite',
  env: extraEnv = {},
}) {
  const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-test-'));
  process.env.DATA_DIR = DATA_DIR;

  const BASE = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    ...extraEnv,
    DATA_DIR,
    PORT: String(port),
    ADMIN_PATH: adminPath,
    NODE_ENV: 'test',
  };

  const state = { pass: 0, fail: 0, failures: [], server: null, serverOutput: '' };

  function check(name, condition, detail = '') {
    if (condition) {
      state.pass += 1;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } else {
      state.fail += 1;
      state.failures.push(`${name}${detail ? ' — ' + detail : ''}`);
      console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? ' — ' + detail : ''}`);
    }
  }

  const section = (t) => console.log(`\n\x1b[1m\x1b[36m${t}\x1b[0m`);

  /** Minimal cookie-jar client so each role keeps its own session. */
  function makeClient() {
    const jar = new Map();

    async function req(method, url, { body = null, json = null, headers = {}, raw = null } = {}) {
      const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      const opts = {
        method,
        redirect: 'manual',
        headers: { ...headers, ...(cookie ? { cookie } : {}) },
      };

      if (raw !== null) {
        opts.body = raw;
      } else if (json) {
        opts.headers['content-type'] = 'application/json';
        opts.body = JSON.stringify(json);
      } else if (body) {
        opts.headers['content-type'] = 'application/x-www-form-urlencoded';

        /*
         * Arrays become repeated fields, the way a browser sends them.
         *
         * Passing an array straight to URLSearchParams joins it with commas
         * into one value — so a form with several checkboxes of the same name
         * arrived as a single string and the suite could not exercise the
         * multi-value path at all.
         */
        const params = new URLSearchParams();
        Object.entries(body).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
          else if (value !== undefined && value !== null) params.append(key, value);
        });
        opts.body = params.toString();
      }

      const res = await fetch(BASE + url, opts);

      // The id the request was sent with, captured before the jar is updated —
      // needed to prove a session was rotated rather than merely re-sent.
      const sentCookie = cookie;

      (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        jar.set(pair.slice(0, idx), pair.slice(idx + 1));
      });

      const text = await res.text();
      return {
        status: res.status,
        location: res.headers.get('location'),
        headers: res.headers,
        sentCookie,
        text,
      };
    }

    return {
      cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
      get: (u, o) => req('GET', u, o),
      post: (u, o) => req('POST', u, o),
      put: (u, o) => req('PUT', u, o),
      del: (u, o) => req('DELETE', u, o),
      async token(url) {
        const r = await req('GET', url);
        const m = r.text.match(/name="_csrf" value="([^"]+)"/);
        return m ? m[1] : '';
      },
    };
  }

  async function loginStaff(username, password) {
    const c = makeClient();
    const t = await c.token(`${adminPath}/login`);
    const r = await c.post(`${adminPath}/login`, { body: { _csrf: t, username, password } });
    return { client: c, redirect: r.location, status: r.status };
  }

  async function loginClient(email, password) {
    const c = makeClient();
    const t = await c.token('/portal/login');
    const r = await c.post('/portal/login', { body: { _csrf: t, email, password } });
    return { client: c, redirect: r.location, status: r.status };
  }

  async function start() {
    if (seedDemo) {
      console.log('seeding demo data…');
      await new Promise((resolve, reject) => {
        const p = spawn('node', ['demo.js'], { env, cwd: __dirname });
        let err = '';
        p.stderr.on('data', (d) => (err += d));
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err))));
      });
    }

    console.log('starting server…');
    // The rate limiter is exercised on purpose by the security suite; leaving it
    // armed for the rest would make every later sign-in depend on how many
    // failures ran before it.
    state.server = spawn('node', ['server.js'], { env, cwd: __dirname });
    state.server.stderr.on('data', (d) => (state.serverOutput += d.toString()));
    state.server.stdout.on('data', (d) => (state.serverOutput += d.toString()));

    for (let i = 0; i < 60; i++) {
      try {
        await fetch(BASE + '/');
        return;
      } catch (_) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw new Error('server did not start');
  }

  function stop() {
    try {
      state.server?.kill('SIGKILL');
    } catch (_) {}
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }

  function report() {
    console.log(`\n${'═'.repeat(56)}`);
    console.log(
      `  ${label}:  \x1b[32mPASS ${state.pass}\x1b[0m    ` +
        (state.fail ? `\x1b[31mFAIL ${state.fail}\x1b[0m` : 'FAIL 0')
    );
    console.log('═'.repeat(56));

    if (state.failures.length) {
      console.log('\nFAILED:');
      state.failures.forEach((f) => console.log('  • ' + f));
    }
    return state.fail;
  }

  return {
    DATA_DIR,
    BASE,
    ADMIN: adminPath,
    env,
    state,
    check,
    section,
    makeClient,
    loginStaff,
    loginClient,
    start,
    stop,
    report,
    has: (html, needle) => html.includes(needle),
    countOf: (html, re) => (html.match(re) || []).length,
  };
}

module.exports = { createHarness };
