const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Returns the URL only when it can be shown to point at this machine. Errors name
// the host at most, because the URL itself carries the database password.
export function requireLocalDatabaseUrl(databaseUrl) {
  if (!databaseUrl) throw new Error('Refusing to run: DATABASE_URL is not set.');

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing to run: DATABASE_URL could not be parsed.');
  }

  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Refusing to run: DATABASE_URL host "${parsed.hostname}" is not local.`);
  }
  // Connection parameters can override the host in the authority part.
  if (parsed.searchParams.has('host')) {
    throw new Error('Refusing to run: DATABASE_URL overrides its host with a query parameter.');
  }
  return databaseUrl;
}
