// OHC Rosters Bot — src/index.js
// Discord.js v14 (Node >= 20)

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
} from 'discord.js';
import { logAudit, saveRosterSnapshot } from './db.js';

// =====================
// CONFIG — EDIT THESE
// =====================
const CONFIG = {
  EXCLUDE_FA_MATCHERS: ['FA', 'Free Agent'],

  TEAM_ROLE_IDS: [
    { id: '1412728342079344651', name: 'Aura Gaming' },
    { id: '1399229255442890813', name: 'Boston Brigade' },
    { id: '1411883565003837460', name: 'Denegerates' },
    { id: '1393491675724251206', name: 'Electrify Steel' },
    { id: '1367944623754051715', name: 'Emergence' },
    { id: '1393491709328887879', name: 'Grand Rapids Ice' },
    { id: '1367944574512795709', name: 'High Treason' },
    { id: '1393491823367946281', name: 'Kryptic' },
    { id: '1413387262682468363', name: 'Legion of Chum' },
    { id: '1367944466073125097', name: 'Los Angeles Rumble' },
    { id: '1367943638482685952', name: 'OMiT' },
    { id: '1393491505909596230', name: 'Outkastz Esports' },
    { id: '1367944647573508268', name: 'REGIMENT' },
    { id: '1393491632132853851', name: 'SGP Syndicate' },
    { id: '1416814241846919443', name: 'S9 Gaming' },
    { id: '1393491792409919568', name: 'Peak Gaming' },
    { id: '1367944514622460066', name: 'Phoenix Guard' },
  ],

  TEAM_CAPTAIN_ROLE_NAME: 'Team Captain',
  PLAYER_ROLE_NAME: 'Player',
  COACH_ROLE_NAME: 'Coach',
  PREMIUM_MEMBER_ROLE_ID: '1430337942341156876', // "Premium Members"

  PAGE_SIZE: 6,
};

// =====================
// ENV CHECK
// =====================
for (const key of ['BOT_TOKEN', 'CLIENT_ID', 'GUILD_ID']) {
  if (!process.env[key]) {
    console.error(`Missing .env value: ${key}`);
    process.exit(1);
  }
}

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember],
});

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName('rosters')
    .setDescription('Show/export team rosters (excludes Free Agents)')
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Show all rosters or a single team')
        .addStringOption((opt) =>
          opt.setName('team').setDescription('Exact team name (optional)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('export').setDescription('Export all rosters to CSV')
    ),

  new SlashCommandBuilder()
    .setName('roster')
    .setDescription('Manage a roster (Team Captain of that team or Admin)')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a user to a team and optionally mark as player/coach')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption((o) => o.setName('teamrole').setDescription('Team role').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('as')
            .setDescription('Assign as Player or Coach (optional)')
            .addChoices({ name: 'Player', value: 'player' }, { name: 'Coach', value: 'coach' })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a user from a team (and clear Player/Coach)')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption((o) => o.setName('teamrole').setDescription('Team role').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('setrole')
        .setDescription('Mark a user on a team as Player or Coach')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption((o) => o.setName('teamrole').setDescription('Team role').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('as')
            .setDescription('Player or Coach')
            .setRequired(true)
            .addChoices({ name: 'Player', value: 'player' }, { name: 'Coach', value: 'coach' })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('replace')
        .setDescription('Replace an existing team member with a new member')
        .addUserOption((o) => o.setName('out').setDescription('Member to remove').setRequired(true))
        .addUserOption((o) => o.setName('in').setDescription('Member to add').setRequired(true))
        .addRoleOption((o) => o.setName('teamrole').setDescription('Team role').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('as')
            .setDescription('Set new member as Player or Coach (optional)')
            .addChoices({ name: 'Player', value: 'player' }, { name: 'Coach', value: 'coach' })
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  const appId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  try {
    const before = await rest.get(Routes.applicationGuildCommands(appId, guildId));
    console.log(`[REG] Commands BEFORE (${before.length}):`, before.map(c => c.name).join(', ') || '(none)');

    const putRes = await rest.put(
      Routes.applicationGuildCommands(appId, guildId),
      { body: commands }
    );
    console.log(`[REG] Upserted ${Array.isArray(putRes) ? putRes.length : 0} commands.`);

    const after = await rest.get(Routes.applicationGuildCommands(appId, guildId));
    console.log(`[REG] Commands AFTER (${after.length}):`, after.map(c => c.name).join(', ') || '(none)');
  } catch (err) {
    console.error('[REG] Failed to register commands.');
    console.error(err?.rawError ?? err?.response?.data ?? err);
  }
}

// =====================
// HELPERS
// =====================
function userHasAnyRoleName(member, needles = []) {
  return member.roles.cache.some((r) =>
    needles.some((n) => r.name.toLowerCase().includes(n.toLowerCase()))
  );
}
function excludeIfFA(member) {
  return !userHasAnyRoleName(member, CONFIG.EXCLUDE_FA_MATCHERS);
}
function isConfiguredTeamRoleId(roleId) {
  return CONFIG.TEAM_ROLE_IDS.some((t) => t.id === roleId);
}
function isPremiumMember(member) {
  const id = CONFIG.PREMIUM_MEMBER_ROLE_ID;
  return id ? member.roles.cache.has(id) : false;
}
function getCoachPlayerRoles(guild) {
  const coach = guild.roles.cache.find((r) => r.name === CONFIG.COACH_ROLE_NAME);
  const player = guild.roles.cache.find((r) => r.name === CONFIG.PLAYER_ROLE_NAME);
  return { coach, player };
}
function isCaptainOfTeam(member, teamRoleId) {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const isCaptain = member.roles.cache.some((r) => r.name === CONFIG.TEAM_CAPTAIN_ROLE_NAME);
  const onTeam = member.roles.cache.has(teamRoleId);
  return isAdmin || (isCaptain && onTeam);
}
function memberDisplay(member) {
  return member.displayName;
}
function roleIconURL(role) {
  try {
    return role.iconURL?.({ size: 256 }) || null;
  } catch {
    return null;
  }
}
function getTeamRolesFromConfig(guild) {
  const out = [];
  for (const t of CONFIG.TEAM_ROLE_IDS) {
    const role = guild.roles.cache.get(t.id);
    if (role) out.push({ role, name: t.name ?? role.name });
  }
  return out;
}

// =====================
// READY
// =====================
client.once('ready', async () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
  try {
    client.user.setPresence({ activities: [{ name: '/rosters show' }], status: 'online' });

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.roles.fetch();
    await registerCommands();

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    const list = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID));
    console.log(
      `[REG] Visible in guild now (${list.length}):`,
      list.map(c => `${c.name}${c.default_member_permissions ? ' [restricted]' : ''}`).join(', ') || '(none)'
    );

    console.log('✓ Ready');
  } catch (e) {
    console.error('Startup error:', e);
  }
});

// =====================
// TOKEN DEBUG (safe to remove later)
// =====================
function explainToken(t) {
  if (!t) return 'EMPTY';
  const parts = String(t).split('.');
  const lens = parts.map(p => p.length).join('-');
  return `len=${String(t).length} parts=${parts.length} partsLen=${lens}`;
}
console.log('[DEBUG] BOT_TOKEN:', explainToken(process.env.BOT_TOKEN));

client.login(process.env.BOT_TOKEN);
