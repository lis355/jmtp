const { EventEmitter } = require("events");
const net = require("net");

const Client = require("./client");

module.exports = class Server extends EventEmitter {
	constructor(options) {
		super();

		this.setOptions(options);

		this.tcpServer = (this.options.createServer || net.createServer)()
			.on("close", () => {
				this.emit("close");
			})
			.on("connection", socket => {
				const jsonPeer = socket.jsonPeer = new Client({ createSocket: () => socket });

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

	setOptions(options) {
		this.options = options || {};

		if (!Number.isFinite(this.options.port)) throw new Error("port option is incorrect");

		if (this.options.createServer &&
			typeof this.options.createServer !== "function") throw new Error("createServer option is incorrect");
	}

	listen() {
		this.tcpServer.listen(this.options.port);

		return this;
	}

	close() {
		this.tcpServer.close();
	}
};
