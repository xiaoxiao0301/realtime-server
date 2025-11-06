// Cloudflare Workers real-time chat (no Durable Objects version)
// NOTE: This version keeps state only within a single worker isolate.
// Data may reset on redeploy / eviction and is NOT globally consistent.

// In-memory ephemeral state (per isolate)
const sessions = new Set();
let messages = [];
let files = [];

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const session of sessions) {
    try { session.send(data); } catch { sessions.delete(session); }
  }
}

function handleWebSocket(request) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 400 });
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  sessions.add(server);

  server.addEventListener('message', (evt) => {
    try {
      const data = JSON.parse(evt.data);
      switch (data.type) {
        case 'postMessage': {
          const message = { id: server.uuid || crypto.randomUUID(), text: data.payload, time: Date.now() };
          server.uuid = message.id; // persist id on socket
          messages.push(message);
          if (messages.length > 100) messages = messages.slice(-100);
          broadcast({ type: 'newMessage', payload: message });
          break;
        }
        case 'latestMessages': {
          const after = data.payload?.after || 0;
          const filtered = messages.filter(m => m.time > after);
          server.send(JSON.stringify({ type: 'latestMessagesResponse', payload: filtered }));
          break;
        }
        case 'postFile': {
          const f = { id: server.uuid || crypto.randomUUID(), time: Date.now(), ...data.payload };
          files.push(f);
          if (files.length > 50) files = files.slice(-50);
          break;
        }
        case 'latestFiles': {
          const afterF = data.payload?.after || 0;
          const filteredF = files.filter(f => f.time > afterF);
          server.send(JSON.stringify({ type: 'latestFilesResponse', payload: filteredF }));
          break;
        }
      }
    } catch (e) {
      server.send(JSON.stringify({ type: 'error', payload: e.message }));
    }
  });

  const closeOrError = () => {
    sessions.delete(server);
    if (sessions.size === 0) { messages = []; files = []; }
  };
  server.addEventListener('close', closeOrError);
  server.addEventListener('error', closeOrError);

  return new Response(null, { status: 101, webSocket: client });
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    ...init
  });
}

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection'
        }
      });
    }

    const url = new URL(request.url);
    if (url.pathname === '/') {
      return new Response('Realtime chat worker (no Durable Objects).', { headers: { 'Content-Type': 'text/plain' } });
    }
    if (url.pathname === '/ws') {
      return handleWebSocket(request);
    }
    if (url.pathname === '/messages') {
      const after = Number(url.searchParams.get('after') || 0);
      return jsonResponse(messages.filter(m => m.time > after));
    }
    if (url.pathname === '/files') {
      const after = Number(url.searchParams.get('after') || 0);
      return jsonResponse(files.filter(f => f.time > after));
    }
    return new Response('Not found', { status: 404 });
  }
};