const { EventEmitter } = require("events");

// POMTP
//
// Message
// |--Header----------|--Data-----------------|
// | 4 bytes uint32BE | n bytes binary data   |
// |------------------|-----------------------|

function upperPowerOf2(x) {
	let power = 1;
	while (power < x) power *= 2;

	return power;
}

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

		this._options.encoder = this._options.encoder || JSON.stringify;
		this._options.decoder = this._options.decoder || JSON.parse;

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

		const data = this._options.encoder(object);
		const dataLength = Buffer.byteLength(data);

		const header = Buffer.allocUnsafe(INT_32_SIZE_IN_BYTES);
		header.writeUint32BE(dataLength);

		this._socket.write(header);
		// this._socket.write(data);

		// DEBUG
		(async () => {
			const dd = Buffer.from(data);

			await new Promise(resolve => setTimeout(resolve, 10));
			this._socket.write(Buffer.copyBytesFrom(dd, 0, 10));
			await new Promise(resolve => setTimeout(resolve, 10));
			this._socket.write(Buffer.copyBytesFrom(dd, 10, 22));
		})();
	}

	_clear() {
		this._state = STATE_WAITING_HEADER_MESSAGE_LENGTH;

		this._buffers = []; // array of incoming chunks (buffers)
		this._buffersLength = 0; // total length of all buffers
		this._firstBufferOffset = 0; // offset in the first buffer
		this._readBuffer = null;
		this._readBufferOffset = 0;
	}

	_handleData(data) {
		if (data.length === 0) return this._error(new Error("Empty data"));

		// DEBUG
		console.log(data.length);

		this._buffers.push(data);
		this._buffersLength += data.length;

		this._process();
	}

	_process() {
		switch (this._state) {
			case STATE_WAITING_HEADER_MESSAGE_LENGTH: {
				if (this._canReadBytes(INT_32_SIZE_IN_BYTES)) {
					this._prepareBufferForReading(INT_32_SIZE_IN_BYTES);

					const messageBodyLength = this._readBuffer.readUInt32BE();
					this._incrementBuffersPosition(INT_32_SIZE_IN_BYTES);
					if (messageBodyLength <= 0) return this._error(new Error(`Bad messageBodyLength ${messageBodyLength}`));

					this._messageBodyLength = messageBodyLength;

					this._state = STATE_WAITING_MESSAGE_BODY;

					this._process();
				}

				break;
			}

			case STATE_WAITING_MESSAGE_BODY: {
				if (this._canReadBytes(this._messageBodyLength)) {
					this._prepareBufferForReading(this._messageBodyLength);

					// NOTE OPTIMIZATION
					// if decoder can read from buffer with offset and custom length, we can use allocated temp buffer one time
					// now we always allocate new buffer for decoder by Buffer.copyBytesFrom from first buffer

					const buffer = this._readBuffer.length !== this._messageBodyLength
						? Buffer.copyBytesFrom(this._readBuffer, this._readBufferOffset, this._messageBodyLength)
						: this._readBuffer;

					try {
						const object = this._options.decoder(buffer);

						setImmediate(() => this.emit("message", object));
					} catch (error) {
						return this._error(error);
					}

					this._incrementBuffersPosition(this._messageBodyLength);
					this._messageBodyLength = undefined;

					this._state = STATE_WAITING_HEADER_MESSAGE_LENGTH;

					this._process();
				}

				break;
			}
		}
	}

	_canReadBytes(size) {
		return this._buffersLength - this._firstBufferOffset >= size;
	}

	// must combine buffers, first buffer must be length >= size - _firstBufferReadOffset
	_prepareBufferForReading(size) {
		if (!this._readBuffer ||
			this._readBuffer.size < size) this._readBuffer = Buffer.allocUnsafe(upperPowerOf2(size));

		const firstBufferSpace = this._buffers[0].length - this._firstBufferOffset;
		if (firstBufferSpace >= size) {
			this._buffers[0].copy(this.bufferForReading, writingPosition, this._buffersPosition, this._buffersPosition + writingLength);
		} else if (firstBufferSpace < size) {
			for (let writingPosition = 0; writingPosition < size;) {
				const firstBuffer = this._buffers[0];
				const firstBufferLength = firstBuffer.length;
				const writingLength = Math.min(size - writingPosition, firstBufferLength - this._buffersPosition);
				firstBuffer.copy(this.bufferForReading, writingPosition, this._buffersPosition, this._buffersPosition + writingLength);

				writingPosition += writingLength;
				this._buffersPosition += writingLength;

				if (this._buffersPosition === firstBufferLength) this.shiftBuffers();
			}
		}
	}

	_incrementBuffersPosition(size) {
		this._firstBufferOffset += size;

		const firstBufferLength = this._buffers[0].length;
		if (this._firstBufferOffset >= firstBufferLength) {
			this._buffers.shift();
			this._firstBufferOffset -= firstBufferLength;
			this._buffersLength -= firstBufferLength;
		}
	}

	_error(error) {
		this._clear();

		throw error;
	}
}

module.exports = POMTProtocol;
