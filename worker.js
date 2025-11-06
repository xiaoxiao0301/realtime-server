// Cloudflare Workers implementation for real-time chat
export { ChatRoom };

class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.messages = [];
    this.files = [];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(webSocket) {
    webSocket.accept();
    
    const session = {
      webSocket,
      id: crypto.randomUUID(),
    };
    
    this.sessions.add(session);

    webSocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleMessage(session, data);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    webSocket.addEventListener('close', () => {
      this.sessions.delete(session);
      // Clear data when no sessions
      if (this.sessions.size === 0) {
        this.messages = [];
        this.files = [];
      }
    });

    webSocket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.sessions.delete(session);
    });
  }

  async handleMessage(session, data) {
    switch (data.type) {
      case 'postMessage':
        await this.handlePostMessage(session, data.payload);
        break;
      case 'latestMessages':
        await this.handleLatestMessages(session, data.payload);
        break;
      case 'postFile':
        await this.handlePostFile(session, data.payload);
        break;
      case 'latestFiles':
        await this.handleLatestFiles(session, data.payload);
        break;
    }
  }

  async handlePostMessage(session, messageText) {
    // 直接处理纯文本消息，不使用patch格式
    const message = {
      id: session.id,
      text: messageText,
      time: Date.now()
    };
    this.messages.push(message);
    
    // Keep only last 100 messages
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }

    // 广播新消息给所有连接的客户端
    this.broadcast({
      type: 'newMessage',
      payload: message
    });
  }

  async handleLatestMessages(session, data) {
    const after = data?.after || 0;
    const filteredMessages = this.messages.filter(msg => msg.time > after);
    
    session.webSocket.send(JSON.stringify({
      type: 'latestMessagesResponse',
      payload: filteredMessages
    }));
  }

  async handlePostFile(session, fileData) {
    const fileMsg = {
      id: session.id,
      name: fileData.name,
      mime: fileData.type,
      size: fileData.size,
      content: fileData.content,
      time: Date.now()
    };
    this.files.push(fileMsg);
    
    // Keep only last 50 files
    if (this.files.length > 50) {
      this.files = this.files.slice(-50);
    }
  }

  async handleLatestFiles(session, data) {
    const after = data?.after || 0;
    const filteredFiles = this.files.filter(file => file.time > after);
    
    session.webSocket.send(JSON.stringify({
      type: 'latestFilesResponse',
      payload: filteredFiles
    }));
  }

  broadcast(message) {
    for (const session of this.sessions) {
      try {
        session.webSocket.send(JSON.stringify(message));
      } catch (error) {
        // Remove broken sessions
        this.sessions.delete(session);
      }
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
          },
        });
      }

      const url = new URL(request.url);
      
      if (url.pathname === '/') {
        return new Response('Real-time Chat Server is running on Cloudflare Workers', {
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      if (url.pathname === '/ws') {
        // Get or create the Durable Object
        const id = env.CHAT_ROOM.idFromName('global-chat');
        const room = env.CHAT_ROOM.get(id);
        return room.fetch(request);
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      return new Response('Internal Error: ' + error.message, { status: 500 });
    }
  },
};