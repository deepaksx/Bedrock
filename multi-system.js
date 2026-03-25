const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Multi-system configuration
const SYSTEMS = {
  sol: {
    name: 'Sol (@solblunt_bot)',
    type: 'primary',
    host: 'localhost',
    sshKey: null,
    openclawDir: '/data/.openclaw',
    workspaceDir: '/data/.openclaw/workspace',
    color: '#8b5cf6',
    deviceId: '466d99c398568d6bec214bc11a95adbb224792c55c822a98466c4a59b8bb04d7'
  },
  solclone: {
    name: 'SolClone (@solclone_bot)',
    type: 'failover', 
    host: '13.202.186.119',
    sshKey: '/data/.openclaw/workspace/.solclone-key.pem',
    openclawDir: '/home/ubuntu/.openclaw',
    workspaceDir: '/home/ubuntu/.openclaw/workspace',
    color: '#16a34a',
    deviceId: '5bb224001289df34353017d368f2f420ed91df9d67d6f29b765b3fd842729068'
  },
  npm: {
    name: 'NPM (@nxsys_npm_bot)',
    type: 'project_manager',
    host: '3.6.105.91', 
    sshKey: '/data/.openclaw/workspace/.npm-key.pem',
    openclawDir: '/home/ubuntu/.openclaw',
    workspaceDir: '/home/ubuntu/.openclaw/workspace',
    color: '#d97706',
    deviceId: 'd774ee072d48a338f547fb37e6a69e47dc58442fd008c011e9a0da28d8c32e7b'
  }
};

async function runSSHCommand(systemId, command, timeout = 15000) {
  const system = SYSTEMS[systemId];
  if (!system) throw new Error(`Unknown system: ${systemId}`);
  
  if (system.host === 'localhost') {
    try {
      const { stdout, stderr } = await execAsync(command, { timeout });
      return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
      return { success: false, stdout: '', stderr: error.message };
    }
  }
  
  const sshCommand = `ssh -i ${system.sshKey} -o ConnectTimeout=10 -o StrictHostKeyChecking=no ubuntu@${system.host} '${command.replace(/'/g, "'\"'\"'")}'`;
  
  try {
    const { stdout, stderr } = await execAsync(sshCommand, { timeout });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return { success: false, stdout: '', stderr: error.message };
  }
}

async function getSessionsFromSystem(systemId) {
  const system = SYSTEMS[systemId];
  const sessionsPath = path.join(system.openclawDir, 'agents', 'main', 'sessions');
  
  try {
    // Get list of session files
    const listResult = await runSSHCommand(systemId, `find ${sessionsPath} -name "*.json" -type f | head -50`);
    if (!listResult.success || !listResult.stdout) {
      return [];
    }
    
    const sessionFiles = listResult.stdout.split('\n').filter(f => f.trim());
    const sessions = [];
    
    // Read each session file (limit to 20 for performance)
    for (const sessionFile of sessionFiles.slice(0, 20)) {
      const readResult = await runSSHCommand(systemId, `cat "${sessionFile}"`);
      if (readResult.success && readResult.stdout) {
        try {
          const sessionData = JSON.parse(readResult.stdout);
          sessions.push({
            ...sessionData,
            systemId,
            systemName: system.name,
            systemType: system.type,
            systemColor: system.color,
            fileName: path.basename(sessionFile)
          });
        } catch (parseError) {
          console.error(`Failed to parse session ${sessionFile}:`, parseError.message);
        }
      }
    }
    
    // Sort by most recent activity
    sessions.sort((a, b) => {
      const getTimestamp = (session) => {
        const data = Object.values(session)[0];
        return data?.updatedAt || data?.createdAt || 0;
      };
      return getTimestamp(b) - getTimestamp(a);
    });
    
    return sessions;
  } catch (error) {
    console.error(`Error getting sessions from ${systemId}:`, error);
    return [];
  }
}

async function getSystemHealth(systemId) {
  const system = SYSTEMS[systemId];
  
  try {
    const commands = {
      uptime: 'uptime',
      memory: 'free -h',
      disk: 'df -h /',
      processes: 'ps aux | grep openclaw | grep -v grep',
      load: 'cat /proc/loadavg',
    };
    
    const results = {};
    
    for (const [key, command] of Object.entries(commands)) {
      const result = await runSSHCommand(systemId, command);
      results[key] = result.success ? result.stdout : 'N/A';
    }
    
    return {
      systemId,
      systemName: system.name,
      systemType: system.type,
      host: system.host,
      status: 'online',
      ...results
    };
  } catch (error) {
    return {
      systemId,
      systemName: system.name,
      systemType: system.type,
      host: system.host,
      status: 'error',
      error: error.message
    };
  }
}

async function getAllSystemsSessions() {
  console.log('🔍 Aggregating sessions from all OpenClaw systems...');
  
  const allSessions = [];
  const systemHealth = {};
  
  for (const systemId of Object.keys(SYSTEMS)) {
    try {
      console.log(`📡 Fetching sessions from ${SYSTEMS[systemId].name}...`);
      const sessions = await getSessionsFromSystem(systemId);
      const health = await getSystemHealth(systemId);
      
      allSessions.push(...sessions);
      systemHealth[systemId] = health;
      
      console.log(`✅ Found ${sessions.length} sessions from ${SYSTEMS[systemId].name}`);
    } catch (error) {
      console.error(`❌ Error fetching from ${SYSTEMS[systemId].name}:`, error.message);
      systemHealth[systemId] = {
        systemId,
        systemName: SYSTEMS[systemId].name,
        status: 'error',
        error: error.message
      };
    }
  }
  
  return {
    sessions: allSessions,
    systemHealth,
    totalSessions: allSessions.length,
    systemCounts: Object.fromEntries(
      Object.keys(SYSTEMS).map(id => [
        id, allSessions.filter(s => s.systemId === id).length
      ])
    ),
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  SYSTEMS,
  runSSHCommand,
  getSessionsFromSystem,
  getSystemHealth, 
  getAllSystemsSessions
};