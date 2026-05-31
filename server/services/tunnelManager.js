import { spawn } from 'child_process';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// In-memory map: port -> { port, provider, process, url }
const activeTunnels = new Map();

// On exit, kill all tunnels
process.on('exit', () => {
  for (const session of activeTunnels.values()) {
    if (session.process && !session.process.killed) {
      session.process.kill();
    }
  }
});

async function checkProvider(cmd) {
  try {
    await execAsync(`${cmd} --version`);
    return true;
  } catch (e) {
    return false;
  }
}

export async function getAvailableProviders() {
  const providers = [];
  if (await checkProvider('ngrok')) providers.push('ngrok');
  if (await checkProvider('cloudflared')) providers.push('cloudflared');
  return providers;
}

export async function startTunnel(port, provider) {
  if (activeTunnels.has(port)) {
    return activeTunnels.get(port);
  }

  const providers = await getAvailableProviders();
  if (providers.length === 0) {
    throw new Error('No tunnel providers found. Please install ngrok or cloudflared.');
  }

  const selectedProvider = provider || providers[0];
  if (!providers.includes(selectedProvider)) {
    throw new Error(`Provider ${selectedProvider} not found or not installed.`);
  }

  return new Promise((resolve, reject) => {
    let child;
    let url = null;

    if (selectedProvider === 'ngrok') {
      // ngrok output log is JSON, we look for 'url=' or 'obj.url'
      child = spawn('ngrok', ['http', port.toString(), '--log=stdout', '--log-format=json']);
      
      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          try {
            if (line.trim()) {
              const obj = JSON.parse(line);
              if (obj.url && obj.url.startsWith('https://')) {
                url = obj.url;
                activeTunnels.set(port, { port, provider: 'ngrok', process: child, url });
                resolve(activeTunnels.get(port));
              }
            }
          } catch (e) {}
        }
      });
    } else if (selectedProvider === 'cloudflared') {
      child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);
      
      // cloudflared outputs the url to stderr usually
      child.stderr.on('data', (data) => {
        const out = data.toString();
        const match = out.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !url) {
          url = match[0];
          activeTunnels.set(port, { port, provider: 'cloudflared', process: child, url });
          resolve(activeTunnels.get(port));
        }
      });
    }

    child.on('error', (err) => {
      reject(new Error(`Failed to start tunnel: ${err.message}`));
    });

    // Fallback timeout in case it hangs and never outputs URL
    setTimeout(() => {
      if (!url) {
        if (!child.killed) child.kill();
        reject(new Error(`Tunnel start timed out after 10s.`));
      }
    }, 10000);
  });
}

export async function stopTunnel(port) {
  if (activeTunnels.has(port)) {
    const session = activeTunnels.get(port);
    if (session.process && !session.process.killed) {
      session.process.kill();
    }
    activeTunnels.delete(port);
    return true;
  }
  return false;
}

export function getActiveTunnels() {
  const result = {};
  for (const [port, session] of activeTunnels.entries()) {
    result[port] = { url: session.url, provider: session.provider };
  }
  return result;
}