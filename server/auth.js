import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Firebase fetches its public keys from here
const client = jwksClient({
  jwksUri: 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) {
      console.error('[Auth] Error fetching signing key:', err.message);
      return callback(err, null);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

/**
 * Express middleware to verify Firebase ID tokens.
 * Since we don't have a Service Account JSON for firebase-admin,
 * we verify the JWT manually using Google's public keys.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[Auth] Blocked request: Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // Optional: Verify the audience corresponds to the project ID
  const verifyOptions = {
    algorithms: ['RS256']
  };
  
  // If PROJECT_ID is available in env, enforce it
  if (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID) {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    verifyOptions.audience = projectId;
    verifyOptions.issuer = 'https://securetoken.google.com/' + projectId;
  }

  jwt.verify(token, getKey, verifyOptions, (err, decoded) => {
    if (err) {
      console.warn('[Auth] Blocked request: Invalid token', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    
    // Attach decoded user info to request
    req.user = decoded; // { user_id, email, etc }
    next();
  });
}
