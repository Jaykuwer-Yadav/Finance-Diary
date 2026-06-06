const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (e) {
  // Fallback if dotenv is not installed
}

const app = express();
app.use(express.json());
app.use(cors());

// Dynamically serve firebase-config.js using env variables before static middleware
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

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key_here"; // Keep this hidden!

// Mock Database Users
const mockUsers = [
  { id: "1", email: "admin@company.com", password: "password123", role: "ADMIN" },
  { id: "2", email: "md@company.com", password: "password123", role: "MD" },
  { id: "3", email: "advisor@company.com", password: "password123", role: "FINANCIAL_ADVISOR" },
  { id: "4", email: "employee@company.com", password: "password123", role: "EMPLOYEE" }
];

// MOCK SECURITY MIDDLEWARE: Checks if the user has the required clearance level
const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Access Denied: No Token Provided" });

    const token = authHeader.split(' ')[1];
    try {
      // Decrypt and verify the token
      const verifiedUser = jwt.verify(token, JWT_SECRET);
      req.user = verifiedUser;

      // Check if the user's role is inside the allowed array
      if (allowedRoles.includes(verifiedUser.role)) {
        next(); // Authorization successful, proceed to the route
      } else {
        res.status(403).json({ error: "Access Denied: Insufficient Clearances" });
      }
    } catch (err) {
      res.status(400).json({ error: "Invalid Token" });
    }
  };
};

// LOGIN ENDPOINT
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = mockUsers.find(u => u.email === email && u.password === password);

  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  // Sign the role right into the token payload securely
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, role: user.role });
});

// PROTECTED FINANCIAL ROUTE (Accessible by Admin, MD, Director, Co-Director, Financial Advisor)
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

const IP_FILE = path.join(__dirname, 'registered_ips.json');

// Helper to load IPs
function loadRegisteredIPs() {
  try {
    if (fs.existsSync(IP_FILE)) {
      const data = fs.readFileSync(IP_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading IP file:", err);
  }
  return [];
}

// Helper to save IP
function registerIPAddress(ip) {
  try {
    const ips = loadRegisteredIPs();
    if (!ips.includes(ip)) {
      ips.push(ip);
      fs.writeFileSync(IP_FILE, JSON.stringify(ips, null, 2), 'utf8');
    }
  } catch (err) {
    console.error("Error writing IP file:", err);
  }
}

// Check IP API
app.get('/api/check-ip', (req, res) => {
  const ip = req.query.ip || req.ip || req.connection.remoteAddress;
  const ips = loadRegisteredIPs();
  const isRegistered = ips.includes(ip);
  res.json({ registered: isRegistered });
});

// Register IP API
app.post('/api/register-ip', verifyRole(['ADMIN', 'MD', 'DIRECTOR', 'CO_DIRECTOR', 'FINANCIAL_ADVISOR', 'EMPLOYEE']), (req, res) => {
  const { ip } = req.body;
  if (ip) {
    registerIPAddress(ip);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "IP address required" });
  }
});

app.listen(5000, () => console.log("Server running securely on port 5000"));
