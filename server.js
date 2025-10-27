const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

let messages = [];

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Send existing messages to the newly connected client
    socket.emit("initialMessages", messages);

    // Listen for new messages from clients
    socket.on("newMessage", (msg) => {
        const message = { id: socket.id, text: msg };
        messages.push(message);
        io.emit("messageBroadcast", message); // Broadcast the new message to all clients
    });

    // socket.on("clearMessages", () => {
    //     messages = [];
    //     io.emit("messagesCleared"); // Notify all clients that messages have been cleared
    // });

    socket.on('latestMessages', () => {
        socket.emit('latestMessagesResponse', messages);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        const connectedCount = io.engine.clientsCount;
        if (connectedCount === 0) {
            console.log("All users disconnected. Messages cleared.");
            messages = [];
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

