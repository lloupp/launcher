import WebSocket from 'ws';
const URL = `ws://127.0.0.1:7270`;

function sendRequest(type, payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const id = Math.random().toString(36).slice(2, 8);
    let done = false;
    ws.on('open', () => ws.send(JSON.stringify({ id, type, ...(payload !== undefined && { payload }) })));
    ws.on('message', (data) => {
      const res = JSON.parse(data.toString());
      if (res.id === id && !done) { done = true; ws.close(); resolve(res); }
    });
    ws.on('error', (err) => { if (!done) { done = true; reject(err); } });
    setTimeout(() => { if (!done) { done = true; reject(new Error('Timeout')); } }, 10000);
  });
}

async function run() {
  console.log("=== TEST 1: system.ping ===");
  const ping = await sendRequest("system.ping");
  console.log(JSON.stringify(ping.result));

  console.log("\n=== TEST 2: calc.evaluate (simple) ===");
  const calc1 = await sendRequest("calc.evaluate", { expression: "2+3*4" });
  console.log(`2+3*4 = ${calc1.result?.result} (formatted: ${calc1.result?.formatted})`);

  console.log("\n=== TEST 3: calc.evaluate (complex) ===");
  const calc2 = await sendRequest("calc.evaluate", { expression: "sqrt(144) + sin(0) + pow(2,10)" });
  console.log(`sqrt(144)+sin(0)+pow(2,10) = ${calc2.result?.formatted}`);

  console.log("\n=== TEST 4: clipboard.copy + history ===");
  await sendRequest("clipboard.copy", { text: "Hello Launcher!" });
  await sendRequest("clipboard.copy", { text: "Second clip" });
  const clipHistory = await sendRequest("clipboard.history", { limit: 10 });
  console.log(`Entries: ${clipHistory.result?.total}, top: "${clipHistory.result?.entries[0]?.text}"`);

  console.log("\n=== TEST 5: app.search ===");
  const apps = await sendRequest("app.search", { query: "notepad", limit: 5 });
  console.log(`Found: ${apps.result?.total} apps`);
  for (const a of apps.result?.apps ?? []) console.log(`  - ${a.name} (${a.source}) -> ${a.path}`);

  console.log("\n=== TEST 6: file.search ===");
  const files = await sendRequest("file.search", { query: "README", limit: 5 });
  console.log(`Found: ${files.result?.total} files in ${files.result?.elapsed}ms`);
  for (const f of files.result?.files ?? []) console.log(`  - ${f.name} (${f.isDirectory ? 'dir' : 'file'}) -> ${f.path}`);

  console.log("\n=== ALL TESTS PASSED ===");
}
run().catch(err => { console.error("TEST FAILED:", err.message); process.exit(1); });
