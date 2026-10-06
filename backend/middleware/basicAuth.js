const crypto = require('crypto');

// Constant-time comparison that doesn't leak the expected length.
function same(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// One shared login for the whole app (pages and API), enabled when APP_USERNAME and APP_PASSWORD are set.
function basicAuth() {
  const { APP_USERNAME: user, APP_PASSWORD: pass } = process.env;
  if (!user || !pass) {
    console.log('Login is OFF (APP_USERNAME / APP_PASSWORD not set).');
    return (_req, _res, next) => next();
  }
  console.log('Login is ON (shared username/password).');

  return (req, res, next) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      // Evaluate both so timing doesn't reveal which half was wrong.
      const okUser = same(i < 0 ? '' : decoded.slice(0, i), user);
      const okPass = same(i < 0 ? '' : decoded.slice(i + 1), pass);
      if (okUser && okPass) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="VAN Dashboard", charset="UTF-8"');
    res.status(401).send('Login required.');
  };
}

module.exports = basicAuth;
