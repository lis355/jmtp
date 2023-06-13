const { EventEmitter } = require("events");
const net = require("net");

const Client = require("./client");

module.exports = class Server extends EventEmitter {
	constructor(options) {
		super();

		this.setOptions(options);

		this.server = (this.options.createServer || net.createServer)()
			.on("close", () => {
				this.emit("close");
			})
			.on("connection", socket => {
				if (this.server.sessionIdContext) return;

				const peer = socket.peer = new Client({ createSocket: () => socket });

				this.emit("connection", peer);
			})
			.on("secureConnection", socket => {
				const peer = socket.peer = new Client({ createSocket: () => socket });

				this.emit("connection", peer);
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

	handleConnection(socket) {

	}

	listen() {
		this.server.listen(this.options.port);

		return this;
	}

	close() {
		this.server.close();
	}
};
