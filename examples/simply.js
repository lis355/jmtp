const net = require("node:net");

const POMTProtocol = require("../lib/POMTProtocol");

const PORT = 8100;

const server = net.createServer(socket => {
	server.protocol = new POMTProtocol(socket, message => {
		console.log("server: message from client", message);

		server.protocol.sendMessage({ t: new Date().toISOString() });

		server.close();
	});
});

server.listen(PORT);

const client = net.connect(PORT, "localhost", () => {
	client.protocol = new POMTProtocol(client, message => {
		console.log("client: message from server", message);

		client.end();
	});

	client.protocol.sendMessage({ cmd: "getTime" });
});
