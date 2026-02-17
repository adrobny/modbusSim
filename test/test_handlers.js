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
            console.log(`No handler for ${event}`);
        }
    }
}

// Setup Device
const deviceConfig = {
    name: "TestDevice",
    registers: [
        { type: "Coil", address: 1, dataType: "boolean", value: false },
        { type: "HoldingRegister", address: 10, dataType: "uint16", value: 123 },
        { type: "HoldingRegister", address: 11, dataType: "uint16", value: 456 }
    ]
};
const device = new ModbusDevice(deviceConfig);

const server = new MockServer();
attachHandlers(server, device);

// Tests
console.log('Running Tests...');

function runTest(name, fc, body, expectSuccess, expectedCode) {
    console.log(`\n[Test] ${name}`);

    // Mock Request
    const request = {
        body: { fc, ...body },
        slaveId: 1
    };

    // Callback
    const cb = (payload) => {
        // Parse payload briefly to check Exception (0x80 + FC)
        // Response format: [SlaveID, FC, ...]
        // Exception format: [SlaveID, FC+0x80, ExCode, CRCl, CRCh]

        const responseFc = payload[1];
        if (responseFc & 0x80) {
            // Exception
            const exCode = payload[2];
            if (!expectSuccess) {
                if (exCode === expectedCode) {
                    console.log('PASS: Got expected exception', exCode);
                } else {
                    console.error('FAIL: Got exception', exCode, 'expected', expectedCode);
                }
            } else {
                console.error('FAIL: Got Exception', exCode, 'expected Success');
            }
        } else {
            // Success
            if (expectSuccess) {
                console.log('PASS: Got Success response');
            } else {
                console.error('FAIL: Got Success, expected Exception');
            }
        }
    };

    const eventMap = {
        1: 'readCoils',
        2: 'readDiscreteInputs',
        3: 'readHoldingRegisters',
        4: 'readInputRegisters',
        5: 'writeSingleCoil',
        6: 'writeSingleRegister',
        15: 'writeMultipleCoils',
        16: 'writeMultipleRegisters'
    };

    server.emit(eventMap[fc], request, cb);
}

// 1. Read Valid Code
runTest('Read Valid Coil', 1, { start: 1, count: 1 }, true);

// 2. Read Invalid Coil
runTest('Read Invalid Coil', 1, { start: 99, count: 1 }, false, 0x02);

// 3. Read Valid Holding
runTest('Read Valid Holding', 3, { start: 10, count: 2 }, true);

// 4. Read Invalid Holding (Partial)
runTest('Read Partial Invalid Holding', 3, { start: 9, count: 2 }, false, 0x02);

// 5. Write Valid Single Register
runTest('Write Valid Single Register', 6, { address: 10, value: 555 }, true);

// 6. Write Invalid Single Register
runTest('Write Invalid Single Register', 6, { address: 99, value: 555 }, false, 0x02);

// 7. Write Multiple Registers (Valid)
runTest('Write Multiple Registers Valid', 16, { address: 10, quantity: 2, valuesAsBuffer: Buffer.from([0, 1, 0, 2]) }, true);

// 8. Write Multiple Registers (Invalid)
runTest('Write Multiple Registers Invalid', 16, { address: 12, quantity: 1, valuesAsBuffer: Buffer.from([0, 1]) }, false, 0x02);

console.log('\nDone.');
