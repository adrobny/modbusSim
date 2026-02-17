const Modbus = require('jsmodbus');
const path = require('path');

// Try to resolve the internal RequestFactory
try {
    const requestFactoryPath = require.resolve('jsmodbus/dist/request/request-factory');
    console.log('Found RequestFactory at:', requestFactoryPath);

    const RequestFactoryModule = require(requestFactoryPath);
    const RequestFactory = RequestFactoryModule.default;

    console.log('Original fromBuffer:', RequestFactory.fromBuffer);

    // Patch it
    const originalFromBuffer = RequestFactory.fromBuffer;
    RequestFactory.fromBuffer = function (buffer) {
        console.log('PATCHED fromBuffer called!');
        return originalFromBuffer.call(this, buffer);
    };

    console.log('Patched fromBuffer:', RequestFactory.fromBuffer);

    // Create a buffer that triggers RequestFactory (e.g. valid FC 3)
    // We need to simulate how ModbusRTURequest calls it.
    // Or just call Modbus.requests.RequestFactory.fromBuffer if it exposes the same object.

    // Check if Modbus.requests.RequestFactory IS the same object
    console.log('Is same object via Modbus.requests:', Modbus.requests.RequestFactory === RequestFactory);

    // Test trace via Modbus.requests
    const buf = Buffer.from([0x03, 0x00, 0x00, 0x00, 0x01]);
    Modbus.requests.RequestFactory.fromBuffer(buf);

} catch (e) {
    console.error('Error patching:', e);
}
