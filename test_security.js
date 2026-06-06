const http = require('http');

const PORT = 5000;
const HOST = 'localhost';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(dataString);
    }
    
    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(responseBody);
        } catch (e) {
          parsed = responseBody;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (body) {
      req.write(dataString);
    }
    req.end();
  });
}

async function runTests() {
  console.log('==================================================');
  console.log('      ADCS LEDGER API SECURITY TEST SUITE         ');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, detail = '') {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title} - ${detail}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Login with invalid credentials
    // ----------------------------------------------------
    const logFail = await request('POST', '/api/login', {
      email: 'attacker@evil.com',
      password: 'wrongpassword'
    });
    assert(
      'TC-AUTO-01: Block login with invalid credentials',
      logFail.statusCode === 400 && logFail.body.error === 'Invalid credentials',
      `Got status ${logFail.statusCode}, body: ${JSON.stringify(logFail.body)}`
    );

    // ----------------------------------------------------
    // TEST 2: Login with valid Employee credentials
    // ----------------------------------------------------
    const logEmp = await request('POST', '/api/login', {
      email: 'employee@company.com',
      password: 'password123'
    });
    const empToken = logEmp.body.token;
    assert(
      'TC-AUTO-02: Allow valid Employee login',
      logEmp.statusCode === 200 && empToken !== undefined,
      `Got status ${logEmp.statusCode}, body: ${JSON.stringify(logEmp.body)}`
    );

    // ----------------------------------------------------
    // TEST 3: Access protected financials without authorization
    // ----------------------------------------------------
    const finNoAuth = await request('GET', '/api/financials');
    assert(
      'TC-AUTO-03: Block financials endpoint without token',
      finNoAuth.statusCode === 401 && finNoAuth.body.error === 'Access Denied: No Token Provided',
      `Got status ${finNoAuth.statusCode}, body: ${JSON.stringify(finNoAuth.body)}`
    );

    // ----------------------------------------------------
    // TEST 4: Access protected financials with Employee token
    // ----------------------------------------------------
    const finEmp = await request('GET', '/api/financials', null, {
      'Authorization': `Bearer ${empToken}`
    });
    assert(
      'TC-AUTO-04: Block financials endpoint for Employee (Insufficient clearances)',
      finEmp.statusCode === 403 && finEmp.body.error === 'Access Denied: Insufficient Clearances',
      `Got status ${finEmp.statusCode}, body: ${JSON.stringify(finEmp.body)}`
    );

    // ----------------------------------------------------
    // TEST 5: Access protected financials with Admin token
    // ----------------------------------------------------
    const logAdmin = await request('POST', '/api/login', {
      email: 'admin@company.com',
      password: 'password123'
    });
    const adminToken = logAdmin.body.token;
    
    const finAdmin = await request('GET', '/api/financials', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(
      'TC-AUTO-05: Allow financials endpoint for Admin',
      finAdmin.statusCode === 200 && Array.isArray(finAdmin.body.transactions),
      `Got status ${finAdmin.statusCode}, body: ${JSON.stringify(finAdmin.body)}`
    );

    // ----------------------------------------------------
    // TEST 6: Unauthenticated IP registration check
    // ----------------------------------------------------
    const ipPayload = { ip: '192.168.1.99' };
    const ipNoAuth = await request('POST', '/api/register-ip', ipPayload);
    
    // Note: If we haven't patched server.js yet, this might return 200 (FAIL).
    // We will verify the patch state here.
    const isIpNoAuthBlocked = ipNoAuth.statusCode === 401 || ipNoAuth.statusCode === 403;
    assert(
      'TC-AUTO-06: Block IP registration endpoint without token',
      isIpNoAuthBlocked,
      `Got status ${ipNoAuth.statusCode} (should be 401/403). Body: ${JSON.stringify(ipNoAuth.body)}`
    );

    // ----------------------------------------------------
    // TEST 7: Authenticated IP registration check
    // ----------------------------------------------------
    const ipAuth = await request('POST', '/api/register-ip', ipPayload, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(
      'TC-AUTO-07: Allow IP registration with authorized token',
      ipAuth.statusCode === 200 && ipAuth.body.success === true,
      `Got status ${ipAuth.statusCode}, body: ${JSON.stringify(ipAuth.body)}`
    );

  } catch (err) {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  }

  console.log('\n==================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
