// crawler/auth.js

/**
 * Sets up authentication before crawling begins.
 *
 * Supports:
 * - "none"   : no auth, does nothing
 * - "form"   : fills a login form and submits it
 * - "bearer" : attaches an Authorization header to all requests
 * - "cookie" : sets a session cookie directly
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').BrowserContext} context
 * @param {object} config
 * @returns {Promise<{ attempted: boolean, success: boolean, message: string }>}
 */
export async function performAuth(page, context, config) {
  const { auth, baseURL } = config;

  if (!auth || auth.type === "none") {
    return { attempted: false, success: true, message: "No auth configured" };
  }

  if (auth.type === "bearer") {
    return setupBearerAuth(context, auth);
  }

  if (auth.type === "cookie") {
    return setupCookieAuth(context, auth, baseURL);
  }

  if (auth.type === "form") {
    return setupFormAuth(page, auth, baseURL);
  }

  return {
    attempted: true,
    success: false,
    message: `Unknown auth type: "${auth.type}". Expected "none", "form", "bearer", or "cookie".`
  };
}

async function setupBearerAuth(context, auth) {
  if (!auth.bearerToken) {
    return {
      attempted: true,
      success: false,
      message: 'Auth type is "bearer" but no bearerToken was provided. Set TEST_BEARER_TOKEN in .env.'
    };
  }

  await context.setExtraHTTPHeaders({
    Authorization: `Bearer ${auth.bearerToken}`
  });

  return {
    attempted: true,
    success: true,
    message: "Bearer token attached to all requests"
  };
}

async function setupCookieAuth(context, auth, baseURL) {
  const cookie = auth.cookie;

  if (!cookie || !cookie.name || !cookie.value) {
    return {
      attempted: true,
      success: false,
      message: 'Auth type is "cookie" but cookie.name/cookie.value were not both provided. Set TEST_SESSION_COOKIE in .env.'
    };
  }

  const domain = cookie.domain || new URL(baseURL).hostname;

  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain,
      path: "/"
    }
  ]);

  return {
    attempted: true,
    success: true,
    message: `Cookie "${cookie.name}" set for domain "${domain}"`
  };
}

async function setupFormAuth(page, auth, baseURL) {
  if (!auth.username || !auth.password) {
    return {
      attempted: true,
      success: false,
      message: 'Auth type is "form" but username/password are not set.'
    };
  }

  const required = ["loginURL", "usernameSelector", "passwordSelector", "submitSelector", "successURLContains"];
  const missing = required.filter((key) => !auth[key]);
  if (missing.length > 0) {
    return {
      attempted: true,
      success: false,
      message: `Auth type is "form" but config is missing: ${missing.join(", ")}`
    };
  }

  const loginUrl = new URL(auth.loginURL, baseURL).toString();

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (err) {
    return {
      attempted: true,
      success: false,
      message: `Could not load login page at ${loginUrl}: ${err.message}`
    };
  }

  try {
    await page.fill(auth.usernameSelector, auth.username);
    await page.fill(auth.passwordSelector, auth.password);
    await page.click(auth.submitSelector);
  } catch (err) {
    return {
      attempted: true,
      success: false,
      message: `Could not fill/submit login form (check selectors in config): ${err.message}`
    };
  }

  try {
    await page.waitForURL(
      (url) => url.toString().includes(auth.successURLContains),
      { timeout: 10000 }
    );
    return { attempted: true, success: true, message: "Login succeeded" };
  } catch {
    return {
      attempted: true,
      success: false,
      message: `Login may have failed - URL did not contain "${auth.successURLContains}" after submit. Current URL: ${page.url()}`
    };
  }
}