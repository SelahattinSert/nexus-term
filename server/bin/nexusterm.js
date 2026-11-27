#!/usr/bin/env node
// NexusTerm command line entry point.
//   nexusterm          start the server and open the browser
//   nexusterm mcp      run as a stdio MCP server (forwards to the running NexusTerm)
const [command] = process.argv.slice(2);

if (command === 'mcp') {
  const { runStdioBridge } = await import('../mcp/stdioBridge.js');
  await runStdioBridge();
} else if (command === '--help' || command === '-h' || command === 'help') {
  console.log('Usage:\n  nexusterm        Start NexusTerm\n  nexusterm mcp    Stdio MCP server for AI agents (NexusTerm must be running)');
} else {
  await import('../server.js');
}
