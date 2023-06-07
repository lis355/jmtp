const { EventEmitter } = require("events");
const net = require("net");
const { createHash } = require("crypto");

const createClient = require("./client");

function md5(str) {
	return createHash("md5").update(str).digest("hex");
}

class Server extends EventEmitter {
	constructor() {
		super();

		this.tcpServer = net.createServer()
			.on("close", () => {
				this.emit("close");
			})
			.on("connection", socket => {
				const jsonPeer = socket.jsonPeer = createClient(socket);
				jsonPeer.id = md5(jsonPeer.tcpSocket.remoteAddress + jsonPeer.tcpSocket.remotePort);

				this.emit("connection", jsonPeer);
			})
			.on("error", error => {
				this.emit("error", error);
			})
			.on("listening", () => {
				this.emit("listening");
			})
			.on("drop", data => {
				this.emit("drop", data);
			});
	}

	listen(port) {
		this.port = port;

		this.tcpServer.listen(this.port);

		return this;
	}

	close() {
		this.tcpServer.close();
	}
}

module.exports = function createServer(options) {
	return new Server(options);
};
