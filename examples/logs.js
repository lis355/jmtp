const crypto = require("node:crypto");
const net = require("node:net");

const POMTProtocol = require("../lib/POMTProtocol");

function md5(str) {
	return crypto.createHash("md5").update(str || "").digest("hex");
}

const PORT = 8100;

const server = net.createServer(socket => {
	console.log("server: client connected from", socket.remoteAddress, socket.remotePort);

	const protocol = new POMTProtocol(socket, message => {
		console.log("server: message from client with size", JSON.stringify(message).length, socket.remoteAddress, socket.remotePort);
		console.log("server: message from client", message);

		protocol.sendMessage(md5(JSON.stringify(message)));

		server.close();
	});
});

server.listen(PORT, () => {
	console.log("server: started on port", PORT);
});

const client = net.connect(PORT, "localhost", () => {
	console.log("client:connected to server");

	const obj = { t: new Date().toISOString() };

	const protocol = new POMTProtocol(client, message => {
		console.log("client: message from server with size", JSON.stringify(message).length);
		console.log("client: message from server", message);

		console.log(md5(JSON.stringify(obj)) === message ? "OK" : "ERROR");

		client.end();
	});

	protocol.sendMessage(obj);
});
