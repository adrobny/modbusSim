const Modbus = require('jsmodbus');
const CRC = require('crc');

// Custom Base Classes to bypass 'InvalidFunctionCode' check in jsmodbus
class CustomModbusRequestBody {
    constructor(fc) {
        this._fc = fc;
    }
    get fc() { return this._fc; }
    createPayload() { throw new Error('NotImplemented'); }
    get byteCount() { throw new Error('NotImplemented'); }
}

class CustomModbusResponseBody {
    constructor(fc) {
        this._fc = fc;
    }
    get fc() { return this._fc; }
    createPayload() { throw new Error('NotImplemented'); }
    get byteCount() { throw new Error('NotImplemented'); }
}

class ReportServerIdRequestBody extends CustomModbusRequestBody {
    constructor() {
        super(0x11); // FC 17
    }

    get name() {
        return 'ReportServerId';
    }

    createPayload() {
        return Buffer.alloc(0);
    }

    get byteCount() {
        return 0;
    }

    static fromBuffer(buffer) {
        if (buffer.length < 1) return null;
        if (buffer.readUInt8(0) !== 0x11) return null;
        return new ReportServerIdRequestBody();
    }
}

class ReportServerIdResponseBody extends CustomModbusResponseBody {
    constructor(serverData, runStatus) {
        super(0x11);
        this._serverData = serverData || Buffer.alloc(0);
        this._runStatus = runStatus !== undefined ? runStatus : 0xFF; // 0xFF = Running, 0x00 = OFF
    }

    createPayload() {
        const payload = Buffer.alloc(1 + 2 + this._serverData.length);
        payload.writeUInt8(this._fc, 0); // FC
        payload.writeUInt8(this._serverData.length + 1, 1); // Byte count
        this._serverData.copy(payload, 2);
        payload.writeUInt8(this._runStatus, 2 + this._serverData.length);
        return payload;
    }

    get byteCount() {
        return 1 + 2 + this._serverData.length;
    }
}

class ReadDeviceIdentificationRequestBody extends CustomModbusRequestBody {
    constructor(meiType, readDeviceId, objectId) {
        super(0x2B);
        this._meiType = meiType;
        this._readDeviceId = readDeviceId;
        this._objectId = objectId;
    }

    get name() {
        return 'ReadDeviceIdentification';
    }

    get meiType() { return this._meiType; }
    get readDeviceId() { return this._readDeviceId; }
    get objectId() { return this._objectId; }

    createPayload() {
        const payload = Buffer.alloc(3);
        payload.writeUInt8(this._meiType, 0);
        payload.writeUInt8(this._readDeviceId, 1);
        payload.writeUInt8(this._objectId, 2);
        return payload;
    }

    get byteCount() {
        return 3;
    }

    static fromBuffer(buffer) {
        if (buffer.length < 4) return null;
        const fc = buffer.readUInt8(0);
        const meiType = buffer.readUInt8(1);
        const readDeviceId = buffer.readUInt8(2);
        const objectId = buffer.readUInt8(3);

        if (fc !== 0x2B) return null;
        if (meiType !== 0x0E) return null; // MEI Type must be 14

        return new ReadDeviceIdentificationRequestBody(meiType, readDeviceId, objectId);
    }
}

class ReadDeviceIdentificationResponseBody extends CustomModbusResponseBody {
    constructor(meiType, readDeviceId, conformityLevel, moreFollows, nextObjectId, objects) {
        super(0x2B);
        this._meiType = meiType;
        this._readDeviceId = readDeviceId;
        this._conformityLevel = conformityLevel;
        this._moreFollows = moreFollows;
        this._nextObjectId = nextObjectId;
        this._objects = objects; // Map or Object: { id: value_buffer }
    }

    createPayload() {
        // Calculate size first
        let objectListSize = 0;
        const keys = Object.keys(this._objects);
        keys.forEach(key => {
            const val = this._objects[key];
            objectListSize += 2 + val.length; // Id + Length + Value
        });

        const payload = Buffer.alloc(1 + 6 + objectListSize);
        let offset = 0;
        payload.writeUInt8(this._fc, offset++); // FC
        payload.writeUInt8(this._meiType, offset++);
        payload.writeUInt8(this._readDeviceId, offset++);
        payload.writeUInt8(this._conformityLevel, offset++);
        payload.writeUInt8(this._moreFollows, offset++);
        payload.writeUInt8(this._nextObjectId, offset++);
        payload.writeUInt8(keys.length, offset++); // Number of objects

        keys.forEach(key => {
            const id = parseInt(key);
            const val = this._objects[key];
            payload.writeUInt8(id, offset++);
            payload.writeUInt8(val.length, offset++);
            val.copy(payload, offset);
            offset += val.length;
        });

        return payload;
    }

    get byteCount() {
        let objectListSize = 0;
        Object.keys(this._objects).forEach(key => {
            objectListSize += 2 + this._objects[key].length;
        });
        return 1 + 6 + objectListSize;
    }
}

module.exports = {
    ReportServerIdRequestBody,
    ReportServerIdResponseBody,
    ReadDeviceIdentificationRequestBody,
    ReadDeviceIdentificationResponseBody
};
