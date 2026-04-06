import { initLlama, analyzeCommandError } from '../llmService.js';

async function test() {
    console.log("Initializing Llama...");
    await initLlama();

    const payload = {
        cmd: 'dpckre runn -it --rmm alphine sh',
        exitCode: 1,
        cwd: 'C:\\Users\\Selahattin'
    };

    console.log("Analyzing command...");
    const result = await analyzeCommandError(payload);
    console.log("Result:", result);
}

test().catch(console.error);
