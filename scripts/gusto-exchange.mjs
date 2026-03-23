#!/usr/bin/env node
/**
 * Exchange a Gusto OAuth authorization code for tokens.
 * Usage: node scripts/gusto-exchange.mjs <code>
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../.env');

const CLIENT_ID     = '8s63OZHPPYZheMs8_C0BUWMccr8GPAy0iU8sMSrRnfg';
const CLIENT_SECRET = 'kWtiXiCeh33P-addk-e3qpsTSqhKULrI0EGDV6jCgZk';
const REDIRECT_URI  = 'http://localhost:8080/callback';
const API_BASE      = 'https://api.gusto.com';

const code = process.argv[2];
if (!code) {
  console.error('Usage: node scripts/gusto-exchange.mjs <authorization_code>');
  process.exit(1);
}

function httpsPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = new URLSearchParams(body).toString();
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Accept': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpsGet(urlStr, accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Gusto-API-Version': '2025-11-15',
        Accept: 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Exchanging code for tokens...');

  const tokenRes = await httpsPost(`${API_BASE}/oauth/token`, {
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  if (tokenRes.status !== 200 || !tokenRes.body.access_token) {
    console.error(`❌ Token exchange failed (${tokenRes.status}):`, JSON.stringify(tokenRes.body, null, 2));
    process.exit(1);
  }

  const { access_token, refresh_token, expires_in } = tokenRes.body;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TOKENS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  access_token :', access_token);
  console.log('  refresh_token:', refresh_token ?? '(none)');
  console.log('  expires_in   :', expires_in, 'seconds');

  // Verify with /v1/me
  console.log('\nVerifying with GET /v1/me...');
  const me = await httpsGet(`${API_BASE}/v1/me`, access_token);
  if (me.status === 200) {
    console.log('✅ Token works!');
    console.log(JSON.stringify(me.body, null, 2));
  } else {
    console.warn(`⚠️  /v1/me returned ${me.status}:`, JSON.stringify(me.body, null, 2));
  }

  // List companies
  console.log('\nListing companies...');
  const companies = await httpsGet(`${API_BASE}/v1/companies`, access_token);
  if (companies.status === 200) {
    const list = Array.isArray(companies.body) ? companies.body : [companies.body];
    console.log(`Found ${list.length} company(ies):`);
    for (const c of list) {
      console.log(`  - ${c.name}  uuid=${c.uuid || c.id}`);
    }
  } else {
    console.warn(`Companies returned ${companies.status}:`, JSON.stringify(companies.body, null, 2));
  }

  // List employees in the known company
  const COMPANY_ID = '18cb7380-e837-4f8e-84a2-6d2fe7d64b03';
  console.log(`\nFetching employees for company ${COMPANY_ID}...`);
  const empRes = await httpsGet(`${API_BASE}/v1/companies/${COMPANY_ID}/employees`, access_token);
  let employeeUuid = null;

  if (empRes.status === 200) {
    const emps = Array.isArray(empRes.body) ? empRes.body : (empRes.body.employees ?? []);
    console.log(`Found ${emps.length} employee(s):`);
    for (const e of emps) {
      console.log(`  - ${e.first_name} ${e.last_name}  uuid=${e.uuid}`);
    }
    if (emps.length > 0) {
      employeeUuid = emps[0].uuid;

      // Fetch pay stubs
      console.log(`\nFetching pay stubs for ${emps[0].first_name} ${emps[0].last_name}...`);
      const stubRes = await httpsGet(`${API_BASE}/v1/employees/${employeeUuid}/pay_stubs`, access_token);
      if (stubRes.status === 200) {
        const stubs = Array.isArray(stubRes.body) ? stubRes.body : (stubRes.body.employee_pay_stubs ?? []);
        console.log(`Found ${stubs.length} pay stub(s)`);
        if (stubs.length > 0) {
          const s = stubs[0];
          console.log('  Latest:', JSON.stringify(s, null, 2).slice(0, 400));
        }
      } else {
        console.warn(`Pay stubs returned ${stubRes.status}:`, JSON.stringify(stubRes.body, null, 2));
      }
    }
  } else {
    console.warn(`Employees returned ${empRes.status}:`, JSON.stringify(empRes.body, null, 2));
  }

  // Update .env
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  env = env.replace(/^GUSTO_BEARER_TOKEN=.*$/m, `GUSTO_BEARER_TOKEN=${access_token}`);
  if (env.includes('GUSTO_REFRESH_TOKEN=')) {
    env = env.replace(/^GUSTO_REFRESH_TOKEN=.*$/m, `GUSTO_REFRESH_TOKEN=${refresh_token ?? ''}`);
  } else {
    env = env.replace(/^GUSTO_BEARER_TOKEN=.*$/m, `GUSTO_BEARER_TOKEN=${access_token}\nGUSTO_REFRESH_TOKEN=${refresh_token ?? ''}`);
  }
  if (employeeUuid) {
    env = env.replace(/^GUSTO_EMPLOYEE_UUID=.*$/m, `GUSTO_EMPLOYEE_UUID=${employeeUuid}`);
  }
  env = env.replace(/^USE_MOCK_PROOF=true$/m, 'USE_MOCK_PROOF=false');
  fs.writeFileSync(ENV_PATH, env);

  console.log('\n✅ .env updated:');
  console.log('   GUSTO_BEARER_TOKEN  →', access_token.slice(0, 20) + '...');
  if (refresh_token) console.log('   GUSTO_REFRESH_TOKEN →', refresh_token.slice(0, 20) + '...');
  if (employeeUuid)  console.log('   GUSTO_EMPLOYEE_UUID →', employeeUuid);
  console.log('   USE_MOCK_PROOF      → false');
  console.log('\nRestart the backend to use real Gusto data.\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
