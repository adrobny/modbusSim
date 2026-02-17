const applyPatch = require('../lib/ModbusPatch');
// Apply Patch first!
applyPatch();

const attachHandlers = require('../lib/ServerHandler');
const ModbusDevice = require('../lib/Device');
const Modbus = require('jsmodbus');

// Mock Server
class MockServer {
    constructor() {
        this.handlers = {};
    }

    on(event, cb) {
        this.handlers[event] = cb;
    }

    emit(event, request, cb) {
        if (this.handlers[event]) {
            this.handlers[event](request, cb);
        } else {
            console.error(`No handler for ${event}`);
        }
    }
}

// Setup Device with Identity
const deviceConfig = {
    name: "GenericTestDevice",
    identity: {
        vendorName: "TestVendor",
        productCode: "TestProduct",
        majorMinorRevision: "2.0",
        vendorUrl: "http://test.com",
        productName: "TestName",
        modelName: "TestModel",
        userApplicationName: "TestApp"
    },
    registers: []
};
const device = new ModbusDevice(deviceConfig);
const server = new MockServer();
attachHandlers(server, device);

console.log('\nRunning Generic Modbus Tests...');

function runTest(name, buffer, expectedFc, expectedByteCount) {
    console.log(`\n[Test] ${name}`);

    // Use Factory to parse request (this tests the patch)
    const requestBody = Modbus.requests.RequestFactory.fromBuffer(buffer);

    if (!requestBody) {
        console.error('FAIL: Factory returned null');
        return;
    }

    console.log(`Factory returned: ${requestBody.name} (FC ${requestBody.fc})`);

    // Mock Request Object
    const request = {
        body: requestBody,
        slaveId: 1
    };

    // Callback
    const cb = (payload) => {
        const responseFc = payload[1];
        const dataLen = payload.length;

        if (responseFc & 0x80) {
            console.error(`FAIL: Exception ${payload[2]}`);
        } else {
            console.log(`PASS: Success Response (Length ${dataLen})`);
            if (responseFc !== expectedFc) console.error(`FAIL: FC mismatch ${responseFc} != ${expectedFc}`);
            // if (expectedByteCount && dataLen !== expectedByteCount) console.warn(`WARN: Length ${dataLen} != ${expectedByteCount}`);
        }
    };

    const eventMap = {
        0x11: 'reportServerId',
        0x2B: 'readDeviceIdentification'
    };

    const handlerName = eventMap[requestBody.fc];
    if (!handlerName) {
        console.error(`FAIL: No event mapped for FC ${requestBody.fc}`);
        return;
    }

    server.emit(handlerName, request, cb);
}

// 1. Report Server ID (FC 17)
// Buffer: [11]
runTest('Report Server ID', Buffer.from([0x11]), 0x11);

// 2. Read Device Identification (FC 43)
// Buffer: [2B, 0E, 01, 00] (MEI 14, ReadDevId 1, ObjectId 0)
runTest('Read Device ID (Basic)', Buffer.from([0x2B, 0x0E, 0x01, 0x00]), 0x2B);

// 3. Read Device Identification (FC 43) - Regular
// Buffer: [2B, 0E, 02, 00]
runTest('Read Device ID (Regular)', Buffer.from([0x2B, 0x0E, 0x02, 0x00]), 0x2B);

console.log('\nDone.');
