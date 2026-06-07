const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

try {
  require('dotenv').config();
} catch (e) {
  // Fallback if dotenv is not installed (e.g., using --env-file)
}

const app = express();
app.use(express.json());
app.use(cors());

// ==========================================
// FIREBASE ADMIN INITIALIZATION (CONDITIONAL)
// ==========================================
let adminInitialized = false;
let db = null;

try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  adminInitialized = true;
  console.log("Firebase Admin successfully initialized. Production-grade token verification is active.");
} catch (error) {
  console.warn("WARNING: Firebase Admin could not be initialized (missing serviceAccountKey.json).");
  console.warn("Backend is running in JWT Fallback / Mock mode for local testing.");
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!adminInitialized && !JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables (required for mock JWT mode).");
  process.exit(1);
}

// ==========================================
// SECURE MIDDLEWARE (HYBRID METHOD)
// ==========================================
const verifyRole = (allowedRoles) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Access Denied: No Token Provided" });

    const token = authHeader.split(' ')[1];

    if (adminInitialized) {
      // Production: Google Firebase Admin Token Verification
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();

        if (!userDoc.exists) {
          return res.status(403).json({ error: "Access Denied: User profile missing in Firestore" });
        }

        const userRole = userDoc.data().role;
        if (allowedRoles.includes(userRole)) {
          req.user = { uid: decodedToken.uid, role: userRole };
          next();
        } else {
          res.status(403).json({ error: "Access Denied: Insufficient Clearances" });
        }
      } catch (err) {
        res.status(400).json({ error: "Invalid or Expired Firebase Token" });
      }
    } else {
      // Development/Testing: Local JWT Mock Verification
      try {
        const verifiedUser = jwt.verify(token, JWT_SECRET);
        req.user = verifiedUser;
        if (allowedRoles.includes(verifiedUser.role)) {
          next();
        } else {
          res.status(403).json({ error: "Access Denied: Insufficient Clearances" });
        }
      } catch (err) {
        res.status(400).json({ error: "Invalid Token" });
      }
    }
  };
};

// ==========================================
// MOCK LOGIN ENDPOINT (LOCAL TESTING ONLY)
// ==========================================
if (!adminInitialized) {
  app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const testUsers = [
      { id: "1", email: "admin@company.com", password: "password123", role: "ADMIN" },
      { id: "2", email: "md@company.com", password: "password123", role: "MD" },
      { id: "3", email: "advisor@company.com", password: "password123", role: "FINANCIAL_ADVISOR" },
      { id: "4", email: "employee@company.com", password: "password123", role: "EMPLOYEE" }
    ];
    
    const user = testUsers.find(u => u.email === email && u.password === password);
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, role: user.role });
  });
}

// ==========================================
// DYNAMIC WEB ROUTING
// ==========================================

// Serve firebase-config.js populated from environment variables
app.get('/firebase-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
window.firebaseConfig = {
  apiKey: "${process.env.FIREBASE_API_KEY || ''}",
  authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || ''}",
  projectId: "${process.env.FIREBASE_PROJECT_ID || ''}",
  storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET || ''}",
  messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID || ''}",
  appId: "${process.env.FIREBASE_APP_ID || ''}",
  measurementId: "${process.env.FIREBASE_MEASUREMENT_ID || ''}"
};
  `);
});

app.use(express.static(__dirname));

// PROTECTED FINANCIAL ROUTE
app.get('/api/financials', verifyRole(['ADMIN', 'MD', 'DIRECTOR', 'CO_DIRECTOR', 'FINANCIAL_ADVISOR']), (req, res) => {
  res.json({
    totalEarnings: 124500,
    totalSpent: 42100,
    transactions: [
      { id: 101, amount: 5000, type: "income", user: "Alice" },
      { id: 102, amount: -1200, type: "expense", user: "Bob" }
    ]
  });
});

// IP REGISTRY LOGIC
const IP_FILE = path.join(__dirname, 'registered_ips.json');
function loadRegisteredIPs() {
  try {
    if (fs.existsSync(IP_FILE)) return JSON.parse(fs.readFileSync(IP_FILE, 'utf8'));
  } catch (err) {
    console.error("Error reading IP registry file:", err.message);
  }
  return [];
}
function registerIPAddress(ip) {
  try {
    const ips = loadRegisteredIPs();
    if (!ips.includes(ip)) {
      ips.push(ip);
      fs.writeFileSync(IP_FILE, JSON.stringify(ips, null, 2), 'utf8');
    }
  } catch (err) {
    console.error("Error writing to IP registry file:", err.message);
  }
}

app.get('/api/check-ip', (req, res) => {
  const ip = req.query.ip || req.ip || req.connection.remoteAddress;
  res.json({ registered: loadRegisteredIPs().includes(ip) });
});

app.post('/api/register-ip', verifyRole(['ADMIN', 'MD', 'DIRECTOR', 'CO_DIRECTOR', 'FINANCIAL_ADVISOR', 'EMPLOYEE']), (req, res) => {
  if (req.body.ip) {
    registerIPAddress(req.body.ip);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "IP address required" });
  }
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(5000, () => console.log("Enterprise Server running securely on port 5000"));
}
