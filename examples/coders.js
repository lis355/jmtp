const net = require("node:net");

const cbor = require("cbor");

const POMTProtocol = require("../lib/POMTProtocol");

const PORT = 8100;

const protocolOptions = {
	encode: message => cbor.encode(message),
	decode: buffer => cbor.decode(buffer)
};

const server = net.createServer(socket => {
	server.protocol = new POMTProtocol(socket, protocolOptions, message => {
		console.log("server: message from client", message);

		server.protocol.sendMessage({ t: new Date().toISOString() });

		server.close();
	});
});

server.listen(PORT);

const client = net.connect(PORT, "localhost", () => {
	client.protocol = new POMTProtocol(client, protocolOptions, message => {
		console.log("client: message from server", message);

		client.end();
	});

	client.protocol.sendMessage({ cmd: "getTime" });
});
