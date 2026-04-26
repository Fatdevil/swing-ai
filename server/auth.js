/**
 * Firebase Auth Middleware — Zero external dependencies
 * =====================================================
 * Verifies Firebase ID tokens by fetching Google's public keys directly.
 * No jwks-rsa or jose needed — just jsonwebtoken + native fetch.
 */

import jwt from 'jsonwebtoken';

// Firebase publishes its public keys here (X.509 certificates)
const FIREBASE_KEYS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedKeys = null;
let cacheExpiry = 0;
let fetchInProgress = null; // ST1: deduplicerar parallella key-fetches

/**
 * Fetch and cache Firebase public keys
 */
async function getFirebasePublicKeys() {
  if (cachedKeys && Date.now() < cacheExpiry) return cachedKeys;

  // ST1 FIX: Deduplicera parallella requests.
  // Utan detta: N simultana requests med okänd kid triggar N fetch-anrop mot Google.
  if (fetchInProgress) return fetchInProgress;

  fetchInProgress = (async () => {
    try {
      const res = await fetch(FIREBASE_KEYS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const keys = await res.json();
      cacheExpiry = Date.now() + 3600_000;
      cachedKeys = keys;
      console.log('[Auth] Firebase public keys refreshed, kid count:', Object.keys(keys).length);
      return keys;
    } catch (err) {
      console.error('[Auth] Failed to fetch Firebase public keys:', err.message);
      if (cachedKeys) return cachedKeys;
      throw err;
    } finally {
      fetchInProgress = null; // Frigör låset oavsett resultat
    }
  })();

  return fetchInProgress;
}

/**
 * Express middleware to verify Firebase ID tokens.
 * Fetches Google's public keys directly — no jwks-rsa dependency needed.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[Auth] Blocked request: Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    // Decode header to get the key ID (kid)
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.header?.kid) {
      console.warn('[Auth] Blocked request: Token missing kid header');
      return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
    }

    // Fetch the matching public key
    const keys = await getFirebasePublicKeys();
    const publicKey = keys[decoded.header.kid];

    if (!publicKey) {
      // Key not found — force refresh in case keys rotated
      cacheExpiry = 0;
      const freshKeys = await getFirebasePublicKeys();
      const freshKey = freshKeys[decoded.header.kid];
      if (!freshKey) {
        console.warn('[Auth] Blocked request: Unknown signing key kid:', decoded.header.kid);
        return res.status(401).json({ error: 'Unauthorized: Unknown signing key' });
      }
      // Use the fresh key
      const verifyOptions = buildVerifyOptions();
      const payload = jwt.verify(token, freshKey, verifyOptions);
      req.user = payload;
      return next();
    }

    // Verify the token with the public key
    const verifyOptions = buildVerifyOptions();
    const payload = jwt.verify(token, publicKey, verifyOptions);

    // Attach decoded user info to request
    req.user = payload; // { user_id, email, etc }
    next();
  } catch (err) {
    console.warn('[Auth] Blocked request: Invalid token —', err.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

/**
 * Build JWT verification options
 * S3: FIREBASE_PROJECT_ID är obligatorisk i produktion.
 * Utan den accepteras tokens från VILKET Firebase-projekt som helst.
 */
function buildVerifyOptions() {
  const options = { algorithms: ['RS256'] };

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

  if (!projectId) {
    if (process.env.NODE_ENV === 'production') {
      // I produktion: hård krasch vid startup — bättre att veta direkt än att köra osäkert
      throw new Error(
        '[Auth] FATAL: FIREBASE_PROJECT_ID is required in production. ' +
        'Set the FIREBASE_PROJECT_ID environment variable in Railway.'
      );
    }
    // I dev: varna men fortsätt
    console.warn(
      '[Auth] ⚠️ FIREBASE_PROJECT_ID not set — audience/issuer validation SKIPPED. ' +
      'This is only acceptable in local development.'
    );
    return options;
  }

  options.audience = projectId;
  options.issuer = `https://securetoken.google.com/${projectId}`;
  console.log('[Auth] JWT validation configured for project:', projectId);

  return options;
}
