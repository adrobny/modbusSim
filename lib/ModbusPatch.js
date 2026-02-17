const Modbus = require('jsmodbus');
const CustomRequests = require('./CustomRequests');

function applyPatch() {
    // We need to override the factory to recognize our custom FCs
    const OriginalFactoryFromBuffer = Modbus.requests.RequestFactory.fromBuffer;

    Modbus.requests.RequestFactory.fromBuffer = function (buffer) {
        try {
            if (buffer.length < 1) return null;
            const fc = buffer.readUInt8(0);

            if (fc === 0x11) { // Report Server ID
                return CustomRequests.ReportServerIdRequestBody.fromBuffer(buffer);
            }
            if (fc === 0x2B) { // Read Device Identification
                return CustomRequests.ReadDeviceIdentificationRequestBody.fromBuffer(buffer);
            }

            // Fallback to original
            return OriginalFactoryFromBuffer.call(this, buffer);
        } catch (e) {
            console.error('Error in Patched RequestFactory:', e);
            return null; // or allow original to fail
        }
    };

    console.log('Modbus RequestFactory patched for FC 17/43');
}

module.exports = applyPatch;
