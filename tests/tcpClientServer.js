var crypto = require("crypto");

require("dotenv-flow").config();

const { createServer, createClient } = require("../index");

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const PORT = parseFloat(process.env.PORT) || 8100;
const HOST = process.env.HOST || "localhost";

function md5(str) {
	return crypto.createHash("md5").update(str || "").digest("hex");
}

const server = createServer({
	port: PORT
})
	.on("listening", () => {
		console.log("server: started on port", server.options.port);
	})
	.on("connection", peer => {
		console.log("server: client connected", peer.socket.remoteAddress, peer.socket.remotePort);

		peer.on("message", message => {
			console.log("server: message from client with size", JSON.stringify(message).length, peer.socket.remoteAddress, peer.socket.remotePort);
			console.log(`server: message from client ${JSON.stringify(message)}`);

			peer.send({ hash: md5(JSON.stringify(message)) });
		});

		peer.on("disconnect", () => {
			console.log("server: client disconnected", peer.socket.remoteAddress, peer.socket.remotePort);

			server.close();
		});
	})
	.on("close", () => {
		console.log("server: closed");
	})
	.listen();

const client = createClient({
	host: HOST,
	port: PORT
})
	.on("connect", () => {
		console.log(`client: connected to server ${HOST}:${PORT}`);

		client.data = { date: Date() };
		// client.data = new Array(2 ** 16 * 3).join("A");
		client.send(client.data);

		client.disconnect();
	})
	.on("message", message => {
		console.log("client: message from server with size", JSON.stringify(message).length);
		console.log(`client: message from server ${JSON.stringify(message)}`);

		console.log(md5(JSON.stringify(client.data)) === message.hash ? "OK" : "ERROR");
	})
	.connect();
