#!/usr/bin/env node
/**
 * Gusto OAuth2 Authorization Code Flow Helper
 *
 * Usage:
 *   node scripts/gusto-oauth.mjs
 *
 * 1. Opens (or prints) the Gusto authorization URL
 * 2. Starts a local HTTP server on port 8080 to capture the callback
 * 3. Exchanges the code for access_token + refresh_token
 * 4. Prints tokens + updates .env
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../.env');

// ── Gusto config ─────────────────────────────────────────────────────────────
const CLIENT_ID     = '8s63OZHPPYZheMs8_C0BUWMccr8GPAy0iU8sMSrRnfg';
const CLIENT_SECRET = 'kWtiXiCeh33P-addk-e3qpsTSqhKULrI0EGDV6jCgZk';
const REDIRECT_URI  = 'http://localhost:8080/callback';

// Gusto OAuth endpoints (production)
const AUTH_BASE  = 'https://api.gusto.com';
const API_BASE   = 'https://api.gusto.com';

// ── Build auth URL ────────────────────────────────────────────────────────────
const authUrl =
  `${AUTH_BASE}/oauth/authorize` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code`;

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Gusto OAuth2 Helper');
console.log('═══════════════════════════════════════════════════════════');
console.log('\n1. Open this URL in your browser and authorize the app:\n');
console.log('   ' + authUrl);
console.log('\n2. After authorizing, you will be redirected to localhost:8080');
console.log('   (this script will capture the code automatically)\n');

// Try to auto-open browser
try {
  const { execSync } = await import('child_process');
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execSync(`${cmd} "${authUrl}"`, { stdio: 'ignore' });
  console.log('   (Browser opened automatically)');
} catch {
  console.log('   (Could not open browser automatically — please copy the URL above)');
}

// ── Exchange code for tokens ──────────────────────────────────────────────────
function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString();

    const url = new URL(`${API_BASE}/oauth/token`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.access_token) {
            resolve(parsed);
          } else {
            reject(new Error(`Token exchange failed (${res.statusCode}): ${data}`));
          }
        } catch (e) {
          reject(new Error(`Could not parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Update .env file ──────────────────────────────────────────────────────────
function updateEnv(accessToken, refreshToken) {
  let env = fs.readFileSync(ENV_PATH, 'utf8');

  // Update GUSTO_BEARER_TOKEN
  if (env.includes('GUSTO_BEARER_TOKEN=')) {
    env = env.replace(/^GUSTO_BEARER_TOKEN=.*$/m, `GUSTO_BEARER_TOKEN=${accessToken}`);
  } else {
    env += `\nGUSTO_BEARER_TOKEN=${accessToken}\n`;
  }

  // Update GUSTO_REFRESH_TOKEN (add if missing)
  if (env.includes('GUSTO_REFRESH_TOKEN=')) {
    env = env.replace(/^GUSTO_REFRESH_TOKEN=.*$/m, `GUSTO_REFRESH_TOKEN=${refreshToken}`);
  } else {
    env = env.replace(
      /^GUSTO_BEARER_TOKEN=.*$/m,
      `GUSTO_BEARER_TOKEN=${accessToken}\nGUSTO_REFRESH_TOKEN=${refreshToken}`
    );
  }

  // Switch off mock mode
  env = env.replace(/^USE_MOCK_PROOF=true$/m, 'USE_MOCK_PROOF=false');

  fs.writeFileSync(ENV_PATH, env);
}

// ── Fetch /v1/me to confirm token works ──────────────────────────────────────
function fetchMe(accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}/v1/me`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
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

// ── Fetch employees for a company ────────────────────────────────────────────
function fetchEmployees(accessToken, companyId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}/v1/companies/${companyId}/employees`);
    const options = {
      hostname: url.hostname,
      path: `${url.pathname}?include=all_compensations`,
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

// ── Fetch pay stubs for an employee ──────────────────────────────────────────
function fetchPayStubs(accessToken, employeeUuid) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}/v1/employees/${employeeUuid}/pay_stubs`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
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

// ── Local callback server ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost:8080');

  if (reqUrl.pathname !== '/callback') {
    res.end('Waiting for OAuth callback...');
    return;
  }

  const code  = reqUrl.searchParams.get('code');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    res.writeHead(400);
    res.end(`<h2>OAuth Error: ${error}</h2><p>${reqUrl.searchParams.get('error_description') || ''}</p>`);
    console.error('\n❌ Authorization error:', error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('<h2>No code received</h2>');
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html><body style="font-family:sans-serif;padding:2rem;">
    <h2>✅ Authorization successful!</h2>
    <p>Exchanging code for tokens...</p>
    <p>You can close this tab and check your terminal.</p>
    </body></html>
  `);

  console.log('\n✅ Authorization code received. Exchanging for tokens...');

  try {
    const tokens = await exchangeCode(code);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  TOKENS RECEIVED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  access_token :', tokens.access_token);
    console.log('  refresh_token:', tokens.refresh_token || '(none)');
    console.log('  token_type   :', tokens.token_type);
    console.log('  expires_in   :', tokens.expires_in, 'seconds');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verify token works
    console.log('Verifying token with GET /v1/me ...');
    const me = await fetchMe(tokens.access_token);
    if (me.status === 200) {
      console.log('✅ Token works! /v1/me response:');
      console.log(JSON.stringify(me.body, null, 2));
    } else {
      console.warn(`⚠️  /v1/me returned ${me.status}:`, JSON.stringify(me.body, null, 2));
    }

    // Look up employees in the company
    const COMPANY_ID = '18cb7380-e837-4f8e-84a2-6d2fe7d64b03';
    console.log(`\nFetching employees for company ${COMPANY_ID} ...`);
    const empResult = await fetchEmployees(tokens.access_token, COMPANY_ID);
    if (empResult.status === 200) {
      const employees = Array.isArray(empResult.body) ? empResult.body : (empResult.body.employees || []);
      console.log(`\n✅ Found ${employees.length} employee(s):`);
      for (const emp of employees) {
        console.log(`  - ${emp.first_name} ${emp.last_name}  uuid=${emp.uuid}`);
      }

      // Try pay stubs on the first employee
      if (employees.length > 0) {
        const emp = employees[0];
        console.log(`\nFetching pay stubs for ${emp.first_name} ${emp.last_name} (${emp.uuid}) ...`);
        const stubs = await fetchPayStubs(tokens.access_token, emp.uuid);
        if (stubs.status === 200) {
          const stubList = Array.isArray(stubs.body) ? stubs.body : (stubs.body.employee_pay_stubs || []);
          console.log(`✅ Found ${stubList.length} pay stub(s)`);
          if (stubList.length > 0) {
            const latest = stubList[0];
            console.log('  Latest stub:');
            console.log('    check_date:', latest.check_date);
            console.log('    gross_pay :', latest.gross_pay ?? latest.gross_earnings);
          }
          // Update .env with this employee uuid
          let env = fs.readFileSync(ENV_PATH, 'utf8');
          if (env.includes('GUSTO_EMPLOYEE_UUID=')) {
            env = env.replace(/^GUSTO_EMPLOYEE_UUID=.*$/m, `GUSTO_EMPLOYEE_UUID=${emp.uuid}`);
          } else {
            env += `\nGUSTO_EMPLOYEE_UUID=${emp.uuid}\n`;
          }
          fs.writeFileSync(ENV_PATH, env);
          console.log(`\n  GUSTO_EMPLOYEE_UUID updated to: ${emp.uuid}`);
        } else {
          console.warn(`  Pay stubs returned ${stubs.status}:`, JSON.stringify(stubs.body, null, 2));
        }
      }
    } else {
      console.warn(`⚠️  Employees returned ${empResult.status}:`, JSON.stringify(empResult.body, null, 2));
    }

    // Update .env
    updateEnv(tokens.access_token, tokens.refresh_token || '');
    console.log('\n✅ .env updated:');
    console.log('   GUSTO_BEARER_TOKEN  → new access token');
    console.log('   GUSTO_REFRESH_TOKEN → new refresh token');
    console.log('   USE_MOCK_PROOF      → false');
    console.log('\nYou can now restart the backend to test with real Gusto data.\n');
  } catch (err) {
    console.error('\n❌ Token exchange failed:', err.message);
  }

  server.close();
});

server.listen(8080, '127.0.0.1', () => {
  console.log('\nListening on http://localhost:8080/callback ...');
  console.log('Waiting for you to authorize in the browser...\n');
});
