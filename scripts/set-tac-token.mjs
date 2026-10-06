// Save the TENERIFFE ATHLETIC CLUB session token, for this tool only.
//
//   npm run set-token
//
// Chris has two TrainHeroic accounts and they must not be mixed:
//
//   Coach Chris Chan  user 834314   -> trainheroic-mcp/config.json
//                                      the 1:1 athletes, the Periodizer, the
//                                      coach console. NOT this tool's business.
//   Teneriffe A.C.    user 2914642  -> tac-trainheroic.json, here, this file
//                                      the club's class programming.
//
// So this tool keeps its own token beside itself and never reads, writes or
// falls back to the MCP server's config. Mixing them once already sent an
// afternoon down the wrong hole.
//
// The token is read from stdin, so there is no shell quoting to get wrong and
// it never lands in shell history or a chat transcript.
//
// Getting one: sign in to coachapp.trainheroic.com as the CLUB account, F12,
// Network, click a class in the calendar, then copy the `session-token`
// request header off any api.trainheroic.com request.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'tac-trainheroic.json');

const rl = createInterface({ input: stdin, output: stdout });
console.log('This saves the TENERIFFE ATHLETIC CLUB token, not the Coach Chris Chan one.');
const token = (await rl.question('Paste the session-token and press enter:\n> ')).trim();
rl.close();

if (!token) {
  console.error('\nNothing pasted. Nothing changed.');
  process.exit(1);
}
if (/^session-token:/i.test(token)) {
  console.error('\nThat is the whole header line. Paste just the value.');
  process.exit(1);
}
if (!/^[A-Za-z0-9._-]{20,}$/.test(token)) {
  console.error(`\nThat does not look like a session-token (${token.length} characters). Nothing changed.`);
  process.exit(1);
}

// Refuse the other account's token outright rather than let the two cross.
const mcpConfig = join(ROOT, '..', '..', 'trainheroic-mcp', 'config.json');
if (existsSync(mcpConfig)) {
  try {
    const other = JSON.parse(readFileSync(mcpConfig, 'utf8')).sessionToken;
    if (other && other === token) {
      console.error('\nThat is the Coach Chris Chan token, which is saved in trainheroic-mcp/config.json.');
      console.error('This tool needs the Teneriffe Athletic Club account. Nothing changed.');
      process.exit(1);
    }
  } catch { /* unreadable config is not this script's problem */ }
}

writeFileSync(STORE, `${JSON.stringify({ sessionToken: token }, null, 2)}\n`, 'utf8');
console.log(`\nSaved to ${STORE}`);

// Say which account it actually is, so a wrong paste is caught here.
try {
  const MCP_DIR = process.env.TRAINHEROIC_MCP_DIR ?? 'C:/Users/User/Cowork/trainheroic-mcp';
  const { ThClient } = await import(`file:///${MCP_DIR}/src/thClient.js`);
  const me = await new ThClient(token).whoAmI();
  console.log(`TrainHeroic accepted it: ${me.firstName} ${me.lastName} (user ${me.id}).`);
  if (me.id === 834314) {
    console.error('\nBut that is the Coach Chris Chan account (834314), not the club one.');
    console.error('The club programming will not be visible. Grab the token from the club login.');
    process.exit(1);
  }
} catch (err) {
  console.error(`\nSaved, but TrainHeroic refused it: ${String(err.message ?? err).slice(0, 180)}`);
  process.exit(1);
}
