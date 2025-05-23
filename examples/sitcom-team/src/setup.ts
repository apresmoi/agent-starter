import fs from 'fs';
import dotenv from 'dotenv';
import { MCPVerseClient, FileCredentialStore } from '@mcpverse-org/client';
import personalities from './character/personalities.json';
import premise from './scene/premise.json';
import { Metadata } from './character/types';

dotenv.config();

const CREDENTIAL_BASE_PATH = process.env.CREDENTIALS_PATH || './credentials';

const registerAgent = async (agent: { key: string; name: string; bio: string }) => {
  const botCredentialsPath = `${CREDENTIAL_BASE_PATH}/${agent.key}_creds.json`;

  const verseClient = new MCPVerseClient({
    serverUrl: 'http://localhost:4000',
    credentialStore: new FileCredentialStore(botCredentialsPath),
    agentDetailsForRegistration: {
      apiKey: process.env.MCPVERSE_API_KEY!, // required
      displayName: agent.name,
      bio: agent.bio,
    },
    autoReconnect: true,
  });

  await verseClient.connect();

  const agentId = verseClient.getAgentId();

  if (!agentId) {
    throw new Error('Agent ID not found');
  }

  return {
    id: agentId,
    name: agent.name,
    client: verseClient,
  };
};

const createRoom = async (verseClient: MCPVerseClient, agents: { id: string; name: string }[]) => {
  const rooms = await verseClient.tools.chatRoom.listRoomsWithAccess();

  let roomId: string | null = null;
  if (!rooms.isError && rooms.items.length > 0) {
    roomId = rooms.items[0].id;
  } else {
    const room = await verseClient.tools.chatRoom.create({
      displayName: premise.name,
      description: premise.description,
      isReadOnly: true, // This is a semi-private room, only the characters of the sitcom can see the messages
    });
    if (room.isError) return null;
    roomId = room.data.roomId;
  }

  const permissions = await verseClient.tools.chatRoom.listPermissions({ roomId });
  if (permissions.isError) return null;

  await Promise.all(
    agents.map(async (agent) => {
      if (permissions.items.find((p) => p.agentId === agent.id)) return;
      await verseClient.tools.chatRoom.grantPermission({
        roomId,
        agentId: agent.id,
        permissionLevel: 'ADMIN', // Only admins can write to the room because it's read only
      });
    })
  );

  return roomId;
};

const registerAgents = async () => {
  const agents = await Promise.all(
    Object.entries(personalities).map(
      async ([key, agent]) =>
        await registerAgent({
          key,
          name: agent.name,
          bio: agent.persona,
        })
    )
  );

  const sceneAgent = await registerAgent({
    key: 'scene-generator',
    name: `Sitcom Scene Generator for ${premise.name}`,
    bio: `A sitcom scene generator for the show ${premise.name}`,
  });

  const roomId = await createRoom(sceneAgent.client, agents);

  return { agents: [...agents, sceneAgent], roomId };
};

const main = async () => {
  try {
    const { agents, roomId } = await registerAgents();

    if (!roomId) {
      throw new Error('Room ID not found');
    }

    const metadata: Metadata = {
      roomId,
      agents: agents.map((agent) => ({
        agentId: agent.id,
        name: agent.name,
      })),
    };

    fs.writeFileSync('src/metadata.json', JSON.stringify(metadata, null, 2));

    agents.forEach((agent) => agent.client.disconnect());

    console.log('Setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
};

main();
