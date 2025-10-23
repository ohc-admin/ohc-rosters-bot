// OHC Rosters Bot — src/index.js
// Discord.js v14 / ESM (Node >= 18)
// Features:
// - /rosters show [team]
// - /rosters export
// - /roster add | remove | setrole | replace   (Team Captain of same team OR Admin)
// - Excludes FA (role name contains "FA" or "Free Agent")
// - Requires "Paid Member" role for adds/setrole/replace incoming
// - Uses Role Icon for team logo thumbnails
// - Keeps a persistent "Roster Board" channel updated (one message per team)

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

// =====================
// CONFIG — EDIT THESE
// =====================
const CONFIG = {
  EXCLUDE_FA_MATCHERS: ['FA', 'Free Agent'],
  // Team roles (IDs must be raw numeric strings, not <@&...> mentions)
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
  PAID_MEMBER_ROLE_ID: '1369490353396256869', // "Paid Member"
  PAGE_SIZE: 6,
};

// =====================
// ENV CHECK
// =====================
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('Missing .env values (DISCORD_TOKEN, CLIENT_ID, GUILD_ID).');
  process.exit(1);
}
// Optional: CAPTAINS_CHANNEL_ID (gate roster mgmt)
// Required for live board: ROSTERS_CHANNEL_ID (the channel showing rosters)

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

// =====================
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName('rosters')
    .setDescription('Show/export team rosters (excludes FA)')
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Show all rosters or just one team')
        .addStringOption((opt) =>
          opt.setName('team').setDescription('Exact team name (optional)').setRequired(false)
        )
    )
    .addSubcommand((sub) => sub.setName('export').setDescription('Export all rosters to CSV')),
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
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✓ Slash commands registered');
}

// =====================
// HELPERS
// =====================
function userHasAnyRoleName(member, needles = []) {
  return member.roles.cache.some((r) =>
    needles.some((n) => r.name.toLowerCase().includes(n.toLowerCase()))
  );
}

function getTeamRolesFromConfig(guild) {
  const out = [];
  for (const t of CONFIG.TEAM_ROLE_IDS) {
    const role = guild.roles.cache.get(t.id);
    if (role) out.push({ role, name: t.name ?? role.name });
  }
  return out;
}

function getCoachPlayerRoles(guild) {
  const coach = guild.roles.cache.find((r) => r.name === CONFIG.COACH_ROLE_NAME);
  const player = guild.roles.cache.find((r) => r.name === CONFIG.PLAYER_ROLE_NAME);
  return { coach, player };
}

function roleIconURL(role) {
  try {
    return role.iconURL?.({ size: 256 }) || null;
  } catch {
    return null;
  }
}

function memberDisplay(member) {
  return member.displayName; // nickname alias; fallback handled by discord.js
}

function excludeIfFA(member) {
  return !userHasAnyRoleName(member, CONFIG.EXCLUDE_FA_MATCHERS);
}

function isPaidMember(member) {
  const id = CONFIG.PAID_MEMBER_ROLE_ID;
  return id ? member.roles.cache.has(id) : false;
}

function isConfiguredTeamRoleId(roleId) {
  return CONFIG.TEAM_ROLE_IDS.some((t) => t.id === roleId);
}

function isCaptainOfTeam(member, teamRoleId) {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const isCaptain = member.roles.cache.some((r) => r.name === CONFIG.TEAM_CAPTAIN_ROLE_NAME);
  const onTeam = member.roles.cache.has(teamRoleId);
  return isAdmin || (isCaptain && onTeam);
}

// =====================
// ROSTER RENDERING
// =====================
async function buildRosterEmbeds(guild, targetTeamName = null) {
  await guild.members.fetch();
  const teams = getTeamRolesFromConfig(guild);
  const { coach, player } = getCoachPlayerRoles(guild);

  const selected = targetTeamName
    ? teams.filter((t) => t.name.toLowerCase() === targetTeamName.toLowerCase())
    : teams;

  const embeds = [];
  for (const { role, name } of selected) {
    const members = guild.members.cache
      .filter((m) => m.roles.cache.has(role.id))
      .filter((m) => excludeIfFA(m))
      .sort((a, b) => memberDisplay(a).localeCompare(memberDisplay(b)));

    const embed = new EmbedBuilder()
      .setTitle(`Roster — ${name}`)
      .setColor(0x007bff)
      .setTimestamp(new Date())
      .setFooter({ text: `teamRoleId:${role.id}` });

    const icon = roleIconURL(role);
    if (icon) embed.setThumbnail(icon);

    if (members.size === 0) {
      embed.setDescription('*No players listed*');
    } else {
      const lines = members.map((m) => {
        const tags = [];
        if (coach && m.roles.cache.has(coach.id)) tags.push('Coach');
        if (player && m.roles.cache.has(player.id)) tags.push('Player');
        const tagStr = tags.length ? ` — ${tags.join(' / ')}` : '';
        return `• ${memberDisplay(m)}${tagStr}`;
      });
      embed.setDescription(lines.join('\n').slice(0, 4096));
    }

    embeds.push(embed);
  }
  return embeds;
}

// =====================
// LIVE ROSTERS BOARD
// =====================
async function syncRostersBoard(guild) {
  const channelId = process.env.ROSTERS_CHANNEL_ID;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  await guild.members.fetch();

  // Map existing board messages by footer teamRoleId:####
  const existing = await channel.messages.fetch({ limit: 100 });
  const byTeamId = new Map();
  for (const msg of existing.values()) {
    const emb = msg.embeds?.[0];
    const footer = emb?.footer?.text || '';
    const m = footer.match(/teamRoleId:(\d{5,})/);
    if (m) byTeamId.set(m[1], msg);
  }

  // Upsert: one message per configured team
  for (const t of CONFIG.TEAM_ROLE_IDS) {
    const role = guild.roles.cache.get(t.id);
    if (!role) continue;
    const [embed] = await buildRosterEmbeds(guild, t.name);
    const current = byTeamId.get(t.id);
    if (current) {
      await current.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  }
}

// =====================
// INTERACTIONS
// =====================
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    // /rosters show
    if (interaction.commandName === 'rosters' && interaction.options.getSubcommand() === 'show') {
      const team = interaction.options.getString('team');
      const embeds = await buildRosterEmbeds(interaction.guild, team);
      if (embeds.length === 0) {
        await interaction.reply({ content: 'No team roles are configured in the bot yet.', ephemeral: true });
        return;
      }
      await interaction.reply({ embeds: [embeds[0]] });
      for (let i = 1; i < embeds.length; i++) {
        await interaction.followUp({ embeds: [embeds[i]] });
      }
      // Optional: keep the live board fresh whenever someone checks rosters
      await syncRostersBoard(interaction.guild).catch(() => {});
      return;
    }

    // /rosters export
    if (interaction.commandName === 'rosters' && interaction.options.getSubcommand() === 'export') {
      await interaction.deferReply({ ephemeral: false });
      await interaction.guild.members.fetch();
      const { coach, player } = getCoachPlayerRoles(interaction.guild);

      const header = ['Team', 'DisplayName', 'UserId', 'Tags'];
      const rows = [];
      for (const t of CONFIG.TEAM_ROLE_IDS) {
        const role = interaction.guild.roles.cache.get(t.id);
        if (!role) continue;
        const members = interaction.guild.members.cache
          .filter((m) => m.roles.cache.has(role.id))
          .filter((m) => excludeIfFA(m))
          .sort((a, b) => memberDisplay(a).localeCompare(memberDisplay(b)));
        for (const m of members.values()) {
          const tags = [];
          if (coach && m.roles.cache.has(coach.id)) tags.push('Coach');
          if (player && m.roles.cache.has(player.id)) tags.push('Player');
          rows.push([t.name, memberDisplay(m), m.id, tags.join(' / ')]);
        }
      }
      const csv = [header, ...rows]
        .map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(','))
        .join('\n');
      const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: 'ohc_rosters.csv' });
      await interaction.editReply({ content: 'Exported current rosters:', files: [file] });
      return;
    }

    // /roster (add/remove/setrole/replace)
    if (interaction.commandName === 'roster') {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      // Optional channel gate
      if (process.env.CAPTAINS_CHANNEL_ID && interaction.channelId !== process.env.CAPTAINS_CHANNEL_ID) {
        await interaction.reply({
          content: 'Please use the designated captains channel for roster changes.',
          ephemeral: true,
        });
        return;
      }

      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getUser('user'); // may be null for "replace"
      const teamRole = interaction.options.getRole('teamrole');
      const as = interaction.options.getString('as');

      // Validate the team role is one of the configured teams
      if (!isConfiguredTeamRoleId(teamRole.id)) {
        await interaction.reply({ content: 'That team role is not configured in the bot.', ephemeral: true });
        return;
      }

      // Captain permission scoped to their own team
      if (!isCaptainOfTeam(member, teamRole.id)) {
        await interaction.reply({
          content: 'Only Team Captains of this team (or Admins) can modify this roster.',
          ephemeral: true,
        });
        return;
      }

      const { coach, player } = getCoachPlayerRoles(interaction.guild);

      if (sub === 'add') {
        const targetMember = await interaction.guild.members.fetch(target.id);

        if (!isPaidMember(targetMember)) {
          await interaction.reply({
            content: 'This user is not a Paid Member and cannot be added to a roster.',
            ephemeral: true,
          });
          return;
        }

        // Remove any other configured team roles to prevent dual-roster
        const configuredTeamIds = new Set(CONFIG.TEAM_ROLE_IDS.map((t) => t.id));
        const toRemove = targetMember.roles.cache.filter((r) => configuredTeamIds.has(r.id) && r.id !== teamRole.id);
        if (toRemove.size > 0) await targetMember.roles.remove(toRemove);

        await targetMember.roles.add(teamRole);
        if (as === 'player' && player) await targetMember.roles.add(player);
        if (as === 'coach' && coach) await targetMember.roles.add(coach);

        await interaction.reply({
          content: `Added **${memberDisplay(targetMember)}** to **${teamRole.name}**${
            as ? ` as **${as === 'player' ? 'Player' : 'Coach'}**` : ''
          }.`,
          ephemeral: true,
        });

        await syncRostersBoard(interaction.guild).catch(() => {});
        return;
      }

      if (sub === 'remove') {
        const targetMember = await interaction.guild.members.fetch(target.id);

        await targetMember.roles.remove(teamRole);
        if (player && targetMember.roles.cache.has(player.id)) await targetMember.roles.remove(player);
        if (coach && targetMember.roles.cache.has(coach.id)) await targetMember.roles.remove(coach);

        await interaction.reply({
          content: `Removed **${memberDisplay(targetMember)}** from **${teamRole.name}**.`,
          ephemeral: true,
        });

        await syncRostersBoard(interaction.guild).catch(() => {});
        return;
      }

      if (sub === 'setrole') {
        const targetMember = await interaction.guild.members.fetch(target.id);

        if (!isPaidMember(targetMember)) {
          await interaction.reply({
            content: 'Only Paid Members can be marked as Player or Coach.',
            ephemeral: true,
          });
          return;
        }
        if (!player || !coach) {
          await interaction.reply({
            content: 'Player/Coach roles are not configured on the server.',
            ephemeral: true,
          });
          return;
        }
        if (!targetMember.roles.cache.has(teamRole.id)) {
          await interaction.reply({
            content: `${memberDisplay(targetMember)} is not on **${teamRole.name}**. Use /roster add first.`,
            ephemeral: true,
          });
          return;
        }

        if (as === 'player') {
          await targetMember.roles.add(player);
          if (targetMember.roles.cache.has(coach.id)) await targetMember.roles.remove(coach);
        } else if (as === 'coach') {
          await targetMember.roles.add(coach);
          if (targetMember.roles.cache.has(player.id)) await targetMember.roles.remove(player);
        }

        await interaction.reply({
          content: `Set **${memberDisplay(targetMember)}** as **${as === 'player' ? 'Player' : 'Coach'}** for **${
            teamRole.name
          }**.`,
          ephemeral: true,
        });

        await syncRostersBoard(interaction.guild).catch(() => {});
        return;
      }

      if (sub === 'replace') {
        const outUser = interaction.options.getUser('out');
        const inUser = interaction.options.getUser('in');
        const outMember = await interaction.guild.members.fetch(outUser.id);
        const inMember = await interaction.guild.members.fetch(inUser.id);

        if (!outMember.roles.cache.has(teamRole.id)) {
          await interaction.reply({
            content: `${memberDisplay(outMember)} is not on **${teamRole.name}**.`,
            ephemeral: true,
          });
          return;
        }
        if (!isPaidMember(inMember)) {
          await interaction.reply({
            content: 'Incoming member is not a Paid Member and cannot be added.',
            ephemeral: true,
          });
          return;
        }

        // Remove outgoing from team + clean tags
        await outMember.roles.remove(teamRole);
        if (player && outMember.roles.cache.has(player.id)) await outMember.roles.remove(player);
        if (coach && outMember.roles.cache.has(coach.id)) await outMember.roles.remove(coach);

        // Ensure incoming not on other configured team
        const configuredTeamIds = new Set(CONFIG.TEAM_ROLE_IDS.map((t) => t.id));
        const toRemove = inMember.roles.cache.filter((r) => configuredTeamIds.has(r.id) && r.id !== teamRole.id);
        if (toRemove.size > 0) await inMember.roles.remove(toRemove);

        await inMember.roles.add(teamRole);
        if (as === 'player' && player) await inMember.roles.add(player);
        if (as === 'coach' && coach) await inMember.roles.add(coach);

        await interaction.reply({
          content: `Replaced **${memberDisplay(outMember)}** with **${memberDisplay(inMember)}** on **${
            teamRole.name
          }**${as ? ` (new member set as **${as === 'player' ? 'Player' : 'Coach'}**)` : ''}.`,
          ephemeral: true,
        });

        await syncRostersBoard(interaction.guild).catch(() => {});
        return;
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({
          content: 'Something went wrong. Check bot permissions and role IDs.',
          ephemeral: true,
        });
      } catch {}
    }
  }
});

// =====================
// READY
// =====================
client.once('ready', async () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.roles.fetch();
    await registerCommands();
    // Build the live board once on startup
    await syncRostersBoard(guild).catch(() => {});
    console.log('✓ Ready');
  } catch (e) {
    console.error('Startup error:', e);
  }
});

client.login(process.env.DISCORD_TOKEN);
