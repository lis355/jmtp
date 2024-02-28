# POMTP - Plain object message transfer protocol

Plain object message transfer protocol over tcp simple client-server interaction library

Realisation in Node JS

Use under duplex stream (firstly, `net.Socket`), you can send plain objects and handle input messages 

```javascript
const protocol = new POMTProtocol(socket, message => {
	console.log("message from socket", socket, message);
});

protocol.sendMessage({
	command: "getUpdates"
});

```

Protocol works over TCP socket, message packet contains header and data

```
|--Header----------|--Data-----------------|
| 4 bytes uint32BE | n bytes binary data   |
|------------------|-----------------------|
```

Message (plain object) encodes and decodes via protocol options `encode` and `decode` - default functions are `JSON.stringify` and `JSON.parse`, you can redefine it

```javascript
const cbor = require("cbor");

const protocol = new POMTProtocol(
	socket,
	{
		encode: message => cbor.encode(message),
		decode: buffer => cbor.decode(buffer)
	},
 	message => {
		console.log("message from socket", socket, message);
	});
```

[cbor](https://github.com/hildjj/node-cbor) - it is a library for encode and parse data in the Concise Binary Object Representation (CBOR) data format (RFC8949)