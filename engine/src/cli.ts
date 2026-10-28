#!/usr/bin/env node
// parity               start: run the relay, print the pairing code, enter the loop
// parity join <code>   join a partner's relay, enter the loop
// parity serve         run only the relay
// parity status        print sync status and the next action
// parity card          draft a new card now
// parity log           print the log, one line per entry

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadContext, type Adapter } from './adapter/adapter.js';
import { ClaudeAdapter, DEFAULT_MODEL } from './adapter/claude.js';
import { ManualAdapter } from './adapter/manual.js';
import { ScriptedAdapter } from './adapter/scripted.js';
import type { Channel } from './channel/channel.js';
import { HttpChannel } from './channel/http-client.js';
import { startRelay } from './channel/http-server.js';
import { hasEditor } from './editor.js';
import { AutoGate, EditorGate, InlineGate, type Gate } from './gate.js';
import { DEFAULT_SCHEDULE, resyncDue } from './scheduler.js';
import { Session } from './session.js';
import { deriveState, describeAction, type State } from './state.js';
import type { Entry } from './types.js';

interface Config {
  name: string;
  adapter?: 'claude' | 'scripted' | 'manual';
  model?: string;
  denylist?: string[];
  context?: string[];
  /** minutes */
  maxInterval?: number;
}

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--') && ['adapter', 'gate', 'port', 'model', 'dir'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  const command = flags.help || flags.h ? 'help' : (positional.shift() ?? 'start');
  return { command, positional, flags };
}

const dirOf = (args: Args) => (typeof args.flags.dir === 'string' ? args.flags.dir : process.cwd());
const parityDir = (dir: string) => join(dir, '.parity');
const configPath = (dir: string) => join(parityDir(dir), 'config.json');
const logPath = (dir: string) => join(parityDir(dir), 'log.jsonl');
const scriptPath = (dir: string) => join(parityDir(dir), 'script.json');

function readConfig(dir: string): Config | null {
  if (!existsSync(configPath(dir))) return null;
  return JSON.parse(readFileSync(configPath(dir), 'utf8')) as Config;
}

async function ensureConfig(dir: string, args: Args): Promise<Config> {
  const existing = readConfig(dir);
  if (existing) return existing;
  let name = typeof args.flags.name === 'string' ? args.flags.name : '';
  if (!name) {
    if (!stdin.isTTY) throw new Error('no .parity/config.json here; pass --name=<you> to create one');
    const rl = readline.createInterface({ input: stdin, output: stdout });
    name = (await rl.question('Your name, as your partner will see it: ')).trim();
    rl.close();
  }
  if (!name) throw new Error('a name is required');
  const cfg: Config = { name };
  mkdirSync(join(parityDir(dir), 'context'), { recursive: true });
  writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2) + '\n');
  console.log(`wrote ${configPath(dir)}; put private notes under .parity/context/ and they stay here`);
  return cfg;
}

function readLog(dir: string): Entry[] {
  if (!existsSync(logPath(dir))) return [];
  return readFileSync(logPath(dir), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Entry);
}

function persister(dir: string): (log: Entry[]) => void {
  let written = 0;
  return (log) => {
    mkdirSync(parityDir(dir), { recursive: true });
    if (written === 0 && existsSync(logPath(dir))) writeFileSync(logPath(dir), '');
    const fresh = log.slice(written);
    if (fresh.length) appendFileSync(logPath(dir), fresh.map((e) => JSON.stringify(e)).join('\n') + '\n');
    written = log.length;
  };
}

function pickAdapter(dir: string, cfg: Config, args: Args): Adapter {
  const want = (typeof args.flags.adapter === 'string' ? args.flags.adapter : cfg.adapter) as Config['adapter'] | undefined;
  const model = typeof args.flags.model === 'string' ? args.flags.model : (cfg.model ?? DEFAULT_MODEL);
  if (want === 'scripted' || (!want && existsSync(scriptPath(dir)))) return ScriptedAdapter.fromFile(scriptPath(dir));
  if (want === 'manual') return new ManualAdapter();
  if (want === 'claude' || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return new ClaudeAdapter(model);
  console.log('no model key and no .parity/script.json: you are the agent (manual adapter)');
  return new ManualAdapter();
}

function pickGate(args: Args): Gate {
  const want = typeof args.flags.gate === 'string' ? args.flags.gate : args.flags.yes ? 'auto' : hasEditor() ? 'editor' : 'inline';
  if (want === 'auto') return new AutoGate();
  if (want === 'editor') return new EditorGate();
  return new InlineGate();
}

function render(state: State): string {
  const head = `parity: ${state.status}`;
  const next = state.next.kind === 'wait' || state.detail.startsWith('your move') ? '' : `  ->  ${describeAction(state.next)}`;
  return `${head}  ${state.detail}${next}`;
}

async function startSession(dir: string, args: Args, channel: Channel, banner: string[]): Promise<void> {
  const cfg = await ensureConfig(dir, args);
  const adapter = pickAdapter(dir, cfg, args);
  const gate = pickGate(args);
  const persist = persister(dir);
  const initial = readLog(dir);
  let lastCardAt = Date.now();

  const session = new Session({
    me: cfg.name,
    channel,
    adapter,
    gate,
    context: () => loadContext(cfg.name, dir, cfg.context),
    denylist: cfg.denylist,
    judge: Boolean(args.flags.yes),
    initial,
    persist,
    log: (line) => console.log(line),
    due: () => resyncDue({ ...DEFAULT_SCHEDULE, maxInterval: cfg.maxInterval ?? DEFAULT_SCHEDULE.maxInterval, turnsSinceCard: (Date.now() - lastCardAt) / 60_000 }),
  });

  for (const line of banner) console.log(line);
  console.log(`you are ${cfg.name}; adapter ${adapter.kind}; gate ${gate.mode}`);

  let last = '';
  const until = args.flags.yes ? 'synced' : 'forever';
  const final = await session.run({
    until,
    onState: (s) => {
      if (s.latestCards[cfg.name]) lastCardAt = Date.parse(s.latestCards[cfg.name].at);
      const line = render(s);
      if (line !== last) {
        console.log(line);
        last = line;
      }
    },
  });
  if (until === 'synced') console.log(render(final));
  if (gate instanceof InlineGate) gate.close();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dir = dirOf(args);

  switch (args.command) {
    case 'start': {
      const port = typeof args.flags.port === 'string' ? Number(args.flags.port) : 0;
      const relay = await startRelay({ port, host: args.flags.local ? '127.0.0.1' : '0.0.0.0' });
      process.on('SIGINT', () => relay.close().finally(() => process.exit(0)));
      await startSession(dir, args, relay.channel, [
        'relay running on this machine. your partner runs:',
        '',
        `    parity join ${relay.code}`,
        '',
      ]);
      // give the partner time to fetch the last entries before the relay goes away
      await new Promise((r) => setTimeout(r, 3000));
      await relay.close();
      return;
    }
    case 'join': {
      const code = args.positional[0];
      if (!code) throw new Error('usage: parity join <code>');
      const channel = new HttpChannel(code);
      if (!(await channel.health())) throw new Error(`no relay answering at ${channel.url}`);
      await startSession(dir, args, channel, [`joined relay at ${channel.url}`]);
      return;
    }
    case 'serve': {
      const port = typeof args.flags.port === 'string' ? Number(args.flags.port) : 0;
      const relay = await startRelay({ port });
      console.log(`relay running. both parties run:\n\n    parity join ${relay.code}\n`);
      await new Promise<void>((resolve) => process.on('SIGINT', () => relay.close().finally(resolve)));
      return;
    }
    case 'status': {
      const cfg = readConfig(dir);
      if (!cfg) throw new Error('no .parity/config.json here');
      console.log(render(deriveState(readLog(dir), cfg.name)));
      return;
    }
    case 'log': {
      for (const e of readLog(dir)) console.log(`${String(e.seq).padStart(3)}  ${e.at}  ${e.author.padEnd(10)}  ${e.kind.padEnd(11)}  ${e.id.slice(0, 12)}  ->  ${e.refers?.slice(0, 12) ?? '-'}`);
      return;
    }
    case 'card': {
      const cfg = readConfig(dir);
      if (!cfg) throw new Error('no .parity/config.json here; run parity first');
      const code = args.positional[0];
      if (!code) throw new Error('usage: parity card <code>   (the pairing code of the running relay)');
      const channel = new HttpChannel(code);
      const session = new Session({
        me: cfg.name,
        channel,
        adapter: pickAdapter(dir, cfg, args),
        gate: pickGate(args),
        context: () => loadContext(cfg.name, dir, cfg.context),
        denylist: cfg.denylist,
        initial: readLog(dir),
        persist: persister(dir),
        log: (l) => console.log(l),
      });
      const { state } = await session.step('card');
      console.log(render(state));
      return;
    }
    default:
      console.log('usage: parity [start|join <code>|serve|status|log|card <code>] [--yes] [--adapter claude|scripted|manual] [--gate editor|inline|auto] [--port N] [--name X] [--dir path]');
  }
}

main().catch((err: Error) => {
  console.error(`parity: ${err.message}`);
  process.exit(1);
});
