const { EventEmitter } = require("events");

// POMTP
//
// Message
// |--Header----------|--Data-----------------|
// | 4 bytes uint32BE | n bytes binary data   |
// |------------------|-----------------------|

const INT_32_SIZE_IN_BYTES = 4;

const STATE_WAITING_HEADER_MESSAGE_LENGTH = 1;
const STATE_WAITING_MESSAGE_BODY = 2;

class POMTProtocol extends EventEmitter {
	constructor(socket, options, messageHandler) {
		super();

		if (!socket) throw new Error("Socket is required");
		if (!messageHandler &&
			typeof options === "function") messageHandler = options;

		this._socket = socket;
		this._options = options || {};

		this._options.encode = this._options.encode || JSON.stringify;
		this._options.decode = this._options.decode || JSON.parse;

		this._headerBuffer = Buffer.allocUnsafe(INT_32_SIZE_IN_BYTES);

		this._handleData = this._handleData.bind(this);

		if (typeof messageHandler === "function") {
			this.on("message", messageHandler);

			this._socket.on("end", () => {
				this.unsubscribe();
			});

			this.subscribe();
		}
	}

	subscribe() {
		this._socket.on("data", this._handleData);

		this._clear();
	}

	unsubscribe() {
		this._socket.off("data", this._handleData);

		this._clear();
	}

	sendMessage(object) {
		if (!object) throw new Error("Empty message");

		const data = this._options.encode(object);
		const dataLength = Buffer.byteLength(data);

		this._headerBuffer.writeUint32BE(dataLength);

		this._socket.write(this._headerBuffer);
		this._socket.write(data);
	}

	_clear() {
		this._state = STATE_WAITING_HEADER_MESSAGE_LENGTH;

		this._buffers = []; // array of incoming chunks (buffers)
		this._buffersLength = 0; // total length of all buffers
		this._buffersOffset = 0; // offset in the first buffer
		this._readBuffer = null;
	}

	_handleData(data) {
		if (data.length === 0) return this._error(new Error("Empty data"));

		this._buffers.push(data);
		this._buffersLength += data.length;

		this._process();
	}

	_process() {
		switch (this._state) {
			case STATE_WAITING_HEADER_MESSAGE_LENGTH: {
				if (this._waitBytes(INT_32_SIZE_IN_BYTES)) {
					this._prepareReadBuffer(INT_32_SIZE_IN_BYTES);

					const messageBodyLength = this._readBuffer.readUInt32BE();
					if (messageBodyLength <= 0) return this._error(new Error(`Bad messageBodyLength ${messageBodyLength}`));

					this._messageBodyLength = messageBodyLength;

					this._state = STATE_WAITING_MESSAGE_BODY;
					this._process();
				}

				break;
			}

			case STATE_WAITING_MESSAGE_BODY: {
				if (this._waitBytes(this._messageBodyLength)) {
					this._prepareReadBuffer(this._messageBodyLength);

					try {
						const object = this._options.decode(this._readBuffer);

						setImmediate(() => this.emit("message", object));
					} catch (error) {
						return this._error(error);
					}

					this._messageBodyLength = undefined;

					this._state = STATE_WAITING_HEADER_MESSAGE_LENGTH;
					this._process();
				}

				break;
			}
		}
	}

	_waitBytes(size) {
		return this._buffersLength - this._buffersOffset >= size;
	}

	_prepareReadBuffer(size) {
		this._readBuffer = size === this._headerBuffer.length ? this._headerBuffer : Buffer.allocUnsafe(size);

		for (let writingPosition = 0; writingPosition < size;) {
			const firstBuffer = this._buffers[0];
			const firstBufferLength = firstBuffer.length;
			const writingLength = Math.min(size - writingPosition, firstBufferLength - this._buffersOffset);
			firstBuffer.copy(this._readBuffer, writingPosition, this._buffersOffset, this._buffersOffset + writingLength);

			writingPosition += writingLength;
			this._incrementBuffersOffset(writingLength);
		}
	}

	_incrementBuffersOffset(size) {
		this._buffersOffset += size;

		const firstBufferLength = this._buffers[0].length;
		if (this._buffersOffset >= firstBufferLength) {
			this._buffers.shift();
			this._buffersOffset -= firstBufferLength;
			this._buffersLength -= firstBufferLength;
		}
	}

	_error(error) {
		this._clear();

		throw error;
	}
}

module.exports = POMTProtocol;
