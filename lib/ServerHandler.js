const Modbus = require('jsmodbus');

// Helper to send response
function sendResponse(response, cb) {
    try {
        const payload = response.createPayload();
        cb(payload);
    } catch (e) {
        console.error('Error creating payload:', e);
    }
}

// Helper to create exception response
function sendException(request, fc, code, cb) {
    const responseBody = new Modbus.responses.ExceptionResponseBody(fc, code);
    const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
    sendResponse(response, cb);
}

function attachHandlers(server, device) {
    // Read Coils
    server.on('readCoils', (request, cb) => {
        try {
            const { start, count } = request.body;
            if (!device.isValidAddress('Coil', start, count)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const responseBody = Modbus.responses.ReadCoilsResponseBody.fromRequest(
                request.body,
                device.getBuffer('Coil')
            );
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('ReadCoils Error:', e);
            sendException(request, request.body.fc, 0x04, cb); // Slave Device Failure
        }
    });

    // Read Discrete Inputs
    server.on('readDiscreteInputs', (request, cb) => {
        try {
            const { start, count } = request.body;
            if (!device.isValidAddress('DiscreteInput', start, count)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const responseBody = Modbus.responses.ReadDiscreteInputsResponseBody.fromRequest(
                request.body,
                device.getBuffer('DiscreteInput')
            );
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('ReadDiscreteInputs Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Read Holding Registers
    server.on('readHoldingRegisters', (request, cb) => {
        try {
            const { start, count } = request.body;
            if (!device.isValidAddress('HoldingRegister', start, count)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const responseBody = Modbus.responses.ReadHoldingRegistersResponseBody.fromRequest(
                request.body,
                device.getBuffer('HoldingRegister')
            );
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('ReadHoldingRegisters Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Read Input Registers
    server.on('readInputRegisters', (request, cb) => {
        try {
            const { start, count } = request.body;
            if (!device.isValidAddress('InputRegister', start, count)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const responseBody = Modbus.responses.ReadInputRegistersResponseBody.fromRequest(
                request.body,
                device.getBuffer('InputRegister')
            );
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('ReadInputRegisters Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Write Single Coil
    server.on('writeSingleCoil', (request, cb) => {
        try {
            const { address, value } = request.body;
            if (!device.isValidAddress('Coil', address, 1)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const boolValue = value === 0xFF00;
            device.writeRegister('Coil', address, 'boolean', boolValue);

            const responseBody = Modbus.responses.WriteSingleCoilResponseBody.fromRequest(request.body);
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('WriteSingleCoil Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Write Single Register
    server.on('writeSingleRegister', (request, cb) => {
        try {
            const { address, value } = request.body;
            if (!device.isValidAddress('HoldingRegister', address, 1)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            device.writeRegister('HoldingRegister', address, 'uint16', value);

            const responseBody = Modbus.responses.WriteSingleRegisterResponseBody.fromRequest(request.body);
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('WriteSingleRegister Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Write Multiple Coils
    server.on('writeMultipleCoils', (request, cb) => {
        try {
            const { address, quantity, valuesAsArray } = request.body;

            if (!device.isValidAddress('Coil', address, quantity)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const values = request.body.valuesAsArray;
            for (let i = 0; i < quantity; i++) {
                device.writeRegister('Coil', address + i, 'boolean', !!values[i]);
            }

            const responseBody = Modbus.responses.WriteMultipleCoilsResponseBody.fromRequest(request.body);
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('WriteMultipleCoils Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Write Multiple Registers
    server.on('writeMultipleRegisters', (request, cb) => {
        try {
            const { address, quantity, valuesAsBuffer } = request.body;
            if (!device.isValidAddress('HoldingRegister', address, quantity)) {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const targetBuffer = device.getBuffer('HoldingRegister');
            const offset = address * 2;

            if (offset + valuesAsBuffer.length <= targetBuffer.length) {
                valuesAsBuffer.copy(targetBuffer, offset);
            } else {
                return sendException(request, request.body.fc, 0x02, cb);
            }

            const responseBody = Modbus.responses.WriteMultipleRegistersResponseBody.fromRequest(request.body);
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('WriteMultipleRegisters Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Report Server ID (FC 17)
    server.on('reportServerId', (request, cb) => {
        try {
            // Default: "ModbusSim" + Run Status (0xFF = ON)
            const serverData = Buffer.from(device.name || 'ModbusSim');
            const runStatus = 0xFF;

            // We need to construct the response manually cause it's custom
            const { ReportServerIdResponseBody } = require('./CustomRequests');
            const responseBody = new ReportServerIdResponseBody(serverData, runStatus);
            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);
        } catch (e) {
            console.error('ReportServerId Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });

    // Read Device Identification (FC 43)
    server.on('readDeviceIdentification', (request, cb) => {
        try {
            const { ReadDeviceIdentificationResponseBody } = require('./CustomRequests');
            const { readDeviceId, objectId } = request.body;

            // Basic (0x01) or Regular (0x02)
            // 0x00: VendorName, 0x01: ProductCode, 0x02: MajorMinorRevision

            const identity = device.identity || {};
            const objects = {};

            if (readDeviceId === 0x01 || readDeviceId === 0x02) {
                if (objectId === 0x00 || readDeviceId === 0x02) objects[0] = Buffer.from(identity.vendorName || '');
                if (objectId <= 0x01) objects[1] = Buffer.from(identity.productCode || '');
                if (objectId <= 0x02) objects[2] = Buffer.from(identity.majorMinorRevision || '');
            }

            if (readDeviceId === 0x02) {
                // Extended objects? VenderUrl, ProductName, etc.
                if (objectId <= 0x03) objects[3] = Buffer.from(identity.vendorUrl || '');
                if (objectId <= 0x04) objects[4] = Buffer.from(identity.productName || '');
                if (objectId <= 0x05) objects[5] = Buffer.from(identity.modelName || '');
                if (objectId <= 0x06) objects[6] = Buffer.from(identity.userApplicationName || '');
            }

            // Simple implementation: always return all requested objects in one go if possible
            const responseBody = new ReadDeviceIdentificationResponseBody(
                0x0E, // MEI Type
                readDeviceId,
                0x01, // Conformity Level (Basic=01)
                0x00, // More Follows (0 = no)
                0x00, // Next Object Id
                objects
            );

            const response = Modbus.ModbusRTUResponse.fromRequest(request, responseBody);
            sendResponse(response, cb);

        } catch (e) {
            console.error('ReadDeviceIdentification Error:', e);
            sendException(request, request.body.fc, 0x04, cb);
        }
    });
}

module.exports = attachHandlers;
