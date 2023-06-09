const { Server } = require("socket.io");
const HttpServer = require("./http.server");
const connectDB = require("../configs/db.config");
require("dotenv").config()

class SocketServer {
    #io;
    static getInstance() {
        if (!this.io) {
            this.io = new Server(HttpServer.getInstance(), {
                cors: {
                    origin: ['http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5173/', 'http://localhost:5173', 'http://127.0.0.1:5174/', 'https://localhost:5173', 'https://127.0.0.1:5173', 'http://127.0.0.1:5500/', 'http://127.0.0.1:5173/']
                },
                cookie: true,
                credentials: true
            });
        }
        return this.io;
    }
}


module.exports = SocketServer;
