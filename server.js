const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});
const DiffMatchPath = require("diff-match-patch");
const dmp = new DiffMatchPath(); 

let messages = [];
let files = [];

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Send existing messages to the newly connected client
    // socket.emit("initialMessages", messages);

    // Listen for new messages from clients
    // socket.on("newMessage", (msg) => {
    //     const message = { id: socket.id, text: msg };
    //     messages.push(message);
    //     io.emit("messageBroadcast", message); // Broadcast the new message to all clients
    // });

    // socket.on("clearMessages", () => {
    //     messages = [];
    //     io.emit("messagesCleared"); // Notify all clients that messages have been cleared
    // });

    // socket.on("postMessage", (msg) => {
    //     const message = { id: socket.id, text: msg, time: Date.now() };
    //     console.log("postMessage:", msg, message);
    //     // messages.push(message);
    //     messages = [message]
    // });

    socket.on("patchMessage", (pathText) => {
       const path = dmp.patch_fromText(pathText);
       const [newText, _ ] = dmp.patch_apply(path, messages.length > 0 ? messages[messages.length - 1].text : "");
       const message = { id: socket.id, text: newText, time: Date.now() };
       messages.push(message);
    });

    socket.on('latestMessages', (data) => {
        // data: {after: timestamp}
        const after = data?.after || 0;
        const filteredMessages = messages.filter(msg => msg.time > after);
        socket.emit('latestMessagesResponse', filteredMessages);
    });

    socket.on("postFile", (fileData) => {
        const fileMsg = {
            id: socket.id,
            name: fileData.name,
            mime: fileData.type,
            size: fileData.size,
            content: fileData.content,
            time: Date.now()
        };
        files.push(fileMsg);
    });

    socket.on("latestFiles", (data) => {
        const after = data?.after || 0;
        const filteredFiles = files.filter(file => file.time > after);
        socket.emit("latestFilesResponse", filteredFiles);
    });

    socket.on("disconnect", () => {
        const connectedCount = io.engine.clientsCount;
        if (connectedCount === 0) {
            messages = [];
            files = [];
        }
    });
});


app.get("/", (req, res) => {
    res.send("Real-time Chat Server is running.");
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

