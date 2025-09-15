const admin = require('firebase-admin');

require('dotenv').config();
// Validate required environment variables
const requiredEnvVars = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Prepare service account with proper private key formatting
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
};

try {
  // Initialize Firebase Admin
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error);
  throw error; // Re-throw to prevent further execution
}

const db = admin.firestore();
const auth = admin.auth();

// Test the database connection
const testDbConnection = async () => {
  try {
    await db.collection('test').doc('test').get();
    console.log('✅ Successfully connected to Firestore');
  } catch (error) {
    console.error('❌ Failed to connect to Firestore:', error);
    throw error;
  }
};

// Run the connection test when this module is loaded
if (process.env.NODE_ENV !== 'test') {
  testDbConnection().catch(console.error);
}

module.exports = {
  admin,
  db,
  auth
};
