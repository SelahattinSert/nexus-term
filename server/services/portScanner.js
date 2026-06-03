import os from 'os';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

let cachedTasklist = null;
let lastTasklistFetch = 0;

async function getWindowsProcessName(pid) {
  if (!pid) return 'unknown';
  
  // Cache tasklist for 5 seconds to avoid overwhelming the system
  if (!cachedTasklist || Date.now() - lastTasklistFetch > 5000) {
    try {
      const { stdout } = await execAsync('tasklist /FO CSV /NH');
      cachedTasklist = stdout;
      lastTasklistFetch = Date.now();
    } catch (e) {
      return 'unknown (permission denied)';
    }
  }

  // Format: "node.exe","1234","Console","1","10,000 K"
  const lines = cachedTasklist.split('\n');
  for (const line of lines) {
    const parts = line.split('","');
    if (parts.length >= 2) {
      const currentPid = parts[1].replace('"', '').trim();
      if (currentPid === pid.toString()) {
        return parts[0].replace('"', '').trim();
      }
    }
  }
  return 'unknown';
}

export async function scanPorts(includeEphemeral = false) {
  const platform = os.platform();
  let ports = [];

  try {
    if (platform === 'win32') {
      const { stdout } = await execAsync('netstat -ano');
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && (parts[0] === 'TCP' || parts[0] === 'TCPv6')) {
          const localAddr = parts[1];
          let state = parts[3];
          const pid = parseInt(parts[4]);
          
          if (state === 'LISTENING') state = 'LISTEN'; // Normalize Windows state to Unix state
          
          if (state !== 'LISTEN' && state !== 'ESTABLISHED') continue;
          
          const portStr = localAddr.split(':').pop();
          const port = parseInt(portStr);
          
          if (isNaN(port) || (!includeEphemeral && port > 49151)) continue;

          // deduplicate
          if (!ports.find(p => p.port === port && p.state === state)) {
            const processName = await getWindowsProcessName(pid);
            ports.push({
              port,
              protocol: 'tcp',
              state,
              pid: isNaN(pid) || pid === 0 ? null : pid,
              processName,
              localAddress: localAddr.substring(0, localAddr.lastIndexOf(':'))
            });
          }
        }
      }
    } else if (platform === 'darwin') {
      const { stdout } = await execAsync('lsof -iTCP -iUDP -nP -sTCP:LISTEN,ESTABLISHED | grep -v COMMAND || true');
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 8) {
          const processName = parts[0];
          const pid = parseInt(parts[1]);
          const protocol = parts[7].toLowerCase(); // TCP or UDP
          const addressPart = parts[8];
          const state = parts[9] ? parts[9].replace('(', '').replace(')', '') : 'LISTEN';

          let portStr = '';
          let localAddr = '';
          if (addressPart.includes('->')) {
            const local = addressPart.split('->')[0];
            portStr = local.split(':').pop();
            localAddr = local.substring(0, local.lastIndexOf(':'));
          } else {
            portStr = addressPart.split(':').pop();
            localAddr = addressPart.substring(0, addressPart.lastIndexOf(':'));
          }

          const port = parseInt(portStr);
          if (isNaN(port) || (!includeEphemeral && port > 49151)) continue;

          if (!ports.find(p => p.port === port && p.state === state)) {
            ports.push({
              port,
              protocol,
              state,
              pid: isNaN(pid) ? null : pid,
              processName,
              localAddress: localAddr
            });
          }
        }
      }
    } else { // linux
      const { stdout } = await execAsync('ss -tulpn || true');
      const lines = stdout.split('\n').slice(1); // skip header
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const protocol = parts[0]; // tcp, udp
          const state = parts[1]; // LISTEN, ESTAB
          const localAddrFull = parts[4]; // 0.0.0.0:80
          const processPart = parts[6] || ''; // users:(("node",pid=123,fd=1))
          
          let portStr = localAddrFull.split(':').pop();
          let localAddr = localAddrFull.substring(0, localAddrFull.lastIndexOf(':'));
          const port = parseInt(portStr);
          
          if (isNaN(port) || (!includeEphemeral && port > 49151)) continue;

          let pid = null;
          let processName = 'unknown';
          
          const pidMatch = processPart.match(/pid=(\d+)/);
          if (pidMatch) pid = parseInt(pidMatch[1]);
          
          const nameMatch = processPart.match(/"([^"]+)"/);
          if (nameMatch) processName = nameMatch[1];

          if (!ports.find(p => p.port === port && p.state === state)) {
            ports.push({
              port,
              protocol,
              state,
              pid,
              processName,
              localAddress: localAddr
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[PortScanner] Error scanning ports:', err.message);
  }

  // Sort by port number
  return ports.sort((a, b) => a.port - b.port);
}

export async function killProcess(pid) {
  if (!pid) throw new Error("Invalid PID");
  if (pid === process.pid) throw new Error("Cannot kill the NexusTerm server process (Security Guard)");
  if (pid === 1) throw new Error("Cannot kill init process (Security Guard)");

  const platform = os.platform();
  try {
    if (platform === 'win32') {
      await execAsync(`taskkill /F /PID ${pid}`);
    } else {
      process.kill(pid, 'SIGTERM');
      // In a real scenario, we'd wait and SIGKILL, but for now SIGTERM is standard.
    }
    return { success: true, killed: true };
  } catch (err) {
    throw new Error(`Failed to kill process ${pid}: ${err.message}`);
  }
}