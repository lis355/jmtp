require("dotenv-flow").config();

const { createServer, createClient } = require("../index");

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const PORT = parseFloat(process.env.PORT) || 8100;
const HOST = process.env.HOST || "localhost";

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
			console.log(JSON.stringify(message));

			peer.send({ res: "hi", message });
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
})
	.on("connect", () => {
		console.log(`client: connected to server ${HOST}:${PORT}`);

		client.send({ req: "hello" });
		// client.send(new Array(64 * 1024).join("A"));

		client.disconnect();
	})
	.on("message", message => {
		console.log("client: message from server with size", JSON.stringify(message).length);
		console.log(JSON.stringify(message));
	})
	.connect(PORT, HOST);
