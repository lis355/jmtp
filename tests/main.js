const { createServer, createClient } = require("../index");

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const port = 8000;

const server = createServer()
	.on("listening", () => {
		console.log("server: started on port", server.port);
	})
	.on("connection", peer => {
		console.log("server: client connected", peer.id, peer.tcpSocket.remoteAddress, peer.tcpSocket.remotePort);

		peer.on("message", message => {
			console.log("server: message from client with size", JSON.stringify(message).length, peer.id, peer.tcpSocket.remoteAddress, peer.tcpSocket.remotePort);
			console.log(JSON.stringify(message));

			peer.send({ res: peer.id, message });
		});

		peer.on("disconnect", () => {
			console.log("server: client disconnected", peer.id, peer.tcpSocket.remoteAddress, peer.tcpSocket.remotePort);

			server.close();
		});
	})
	.on("close", () => {
		console.log("server: closed");
	})
	.listen(port);

const client = createClient()
	.on("connect", () => {
		console.log("client: connected to server");

		client.send({ req: "hello" });
		// client.send(new Array(64 * 1024).join("A"));

		client.disconnect();
	})
	.on("message", message => {
		console.log("client: message from server with size", JSON.stringify(message).length);
		console.log(JSON.stringify(message));
	})
	.connect(port);
