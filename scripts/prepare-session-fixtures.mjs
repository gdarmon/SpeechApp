// Explicit operator setup for the existing Fala database. Learners are created
// ONLY in a private diagnostic schema; production account rows are untouched.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import postgres from 'postgres';

const count = Number(process.env.FALA_SESSION_LEARNERS || 2);
if (process.env.FALA_PREPARE_SESSION_FIXTURES !== 'true' || !Number.isInteger(count) || count < 1 || count > 50) {
  throw Error('Explicitly enable isolated session fixtures and choose 1–50 synthetic learners.');
}
// Supply the approved owner/migration connection through the environment.
// Never fetch credentials from a retired hosting account.
const value = process.env.FALA_MIGRATION_DATABASE_URL;
let url; try { url = new URL(value); } catch { throw Error('Set FALA_MIGRATION_DATABASE_URL securely to the approved owner connection.'); }
if (url.username !== 'postgres.mlksvlcnhuavhqdwaplj' || !url.hostname.endsWith('.pooler.supabase.com') || url.pathname !== '/postgres') {
  throw Error('The connection does not match the confirmed Fala database.');
}
url.searchParams.delete('sslmode');
const sql = postgres(url.toString(), { max: 1, prepare: false, ssl: 'require', connect_timeout: 5, onnotice: () => {} });
try {
  if (process.argv[2] === '--cleanup') {
    const file = process.argv[3];
    if (!/^artifacts\/session-fixtures-[0-9a-f-]{36}\.json$/.test(file || '')) throw Error('Use a generated fixture manifest.');
    const fixture = JSON.parse(await readFile(file, 'utf8'));
    if (fixture.schema !== 'fala_latency_probe' || !/^[0-9a-f-]{36}$/.test(fixture.run_id)
      || !Array.isArray(fixture.actors) || fixture.actors.length > 50) throw Error('Invalid fixture manifest.');
    for (const actor of fixture.actors) {
      if (!/^[0-9a-f-]{36}$/.test(actor.id)) throw Error('Invalid synthetic actor.');
      await sql`DELETE FROM fala_latency_probe.users WHERE id=${actor.id}::uuid AND google_subject=${`probe:${fixture.run_id}:${actor.id}`}`;
      await sql`DELETE FROM fala_latency_probe.usage_limits WHERE bucket IN (${`minute:${actor.id}`},${`day:${actor.id}`})`;
    }
    console.log(JSON.stringify({ cleaned: fixture.actors.length, schema: fixture.schema }));
  } else {
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    if (process.env.FALA_APPLY_GENERATION_MIGRATION === 'true') {
      await sql.unsafe(await readFile(new URL('202609270001_generation_claims.sql', migrations), 'utf8'));
      const [metadata] = await sql`SELECT relrowsecurity AS rls,
        has_table_privilege('anon','fala.generation_claims','SELECT') AS anon,
        has_table_privilege('authenticated','fala.generation_claims','SELECT') AS authenticated
        FROM pg_class WHERE oid='fala.generation_claims'::regclass`;
      if (!metadata?.rls || metadata.anon || metadata.authenticated) throw Error('Generation claim permissions failed verification.');
      console.log(JSON.stringify({ applied: '202609270001_generation_claims.sql', permissions: metadata }));
    }
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      const statement = (await readFile(new URL(name, migrations), 'utf8')).replace(/\bfala\b/g, 'fala_latency_probe');
      await sql.unsafe(statement);
    }
    const run = randomUUID(), actors = [];
    for (let index = 0; index < count; index++) {
      const id = randomUUID(), credential = `fala_${randomBytes(32).toString('base64url')}`;
      await sql`INSERT INTO fala_latency_probe.users(id,google_subject,email)
        VALUES(${id}::uuid,${`probe:${run}:${id}`},${`synthetic-${index}@example.invalid`})`;
      await sql`INSERT INTO fala_latency_probe.device_sessions(token_hash,user_id,expires_at)
        VALUES(${createHash('sha256').update(credential).digest('hex')},${id}::uuid,now()+interval '2 hours')`;
      actors.push({ id, token: credential, level: index % 2 ? 3 : 1 });
    }
    await mkdir('artifacts', { recursive: true });
    const file = `artifacts/session-fixtures-${run}.json`;
    await writeFile(file, JSON.stringify({ run_id: run, schema: 'fala_latency_probe', actors }), { mode: 0o600 });
    console.log(JSON.stringify({ manifest: file, learners: count, schema: 'fala_latency_probe', credentials_printed: false }));
  }
} finally { await sql.end({ timeout: 5 }); }
