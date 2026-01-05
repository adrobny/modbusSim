const Modbus = require('jsmodbus');
const SerialPort = require('serialport');

// Configuration
const CONFIG = {
    port: process.env.COM_PORT || 'COM12', // Default COM port
    baudRate: 9600, // Standard Modbus RTU baud rate
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
};

// Modbus register configuration
const REGISTER_ADDRESS = 0x400; // Register 0x400 (1024 decimal)
const REGISTER_VALUE = 0x100;   // Value 0x100 (256 decimal)
const START_ADDRESS = 10;       // Start Modbus address
const END_ADDRESS = 50;         // End Modbus address

// Create input registers buffer (function code 04) - big enough for our register + next one for 2-word response
const inputRegisters = Buffer.alloc((REGISTER_ADDRESS + 2) * 2, 0);
// Set our register value at address 0x400
inputRegisters.writeUInt16BE(REGISTER_VALUE, REGISTER_ADDRESS * 2);
// Set next register to 0x0000 for 2-word response capability
inputRegisters.writeUInt16BE(0x0000, (REGISTER_ADDRESS + 1) * 2);

console.log('Modbus RTU Simulator');
console.log(`COM Port: ${CONFIG.port}`);
console.log(`Baud Rate: ${CONFIG.baudRate}`);
console.log(`Responding to addresses: ${START_ADDRESS}-${END_ADDRESS}`);
console.log(`Register ${REGISTER_ADDRESS.toString(16).toUpperCase()} (decimal ${REGISTER_ADDRESS}): 0x${REGISTER_VALUE.toString(16).toUpperCase()} (decimal ${REGISTER_VALUE})`);
console.log('Starting server...');

// Create serial port
const serialPort = new SerialPort.SerialPort({
    path: CONFIG.port,
    baudRate: CONFIG.baudRate,
    dataBits: CONFIG.dataBits,
    stopBits: CONFIG.stopBits,
    parity: CONFIG.parity
});

// Create Modbus RTU server
const server = new Modbus.server.RTU(serialPort, {
    holding: Buffer.alloc(1024, 0),
    coils: Buffer.alloc(1024, 0),
    discrete: Buffer.alloc(1024, 0),
    input: inputRegisters
});

// Handle read input registers request (function code 04)
server.on('readInputRegisters', (request, reply) => {
    const address = request.unitId;
    const startRegister = request.address;
    const quantity = request.quantity;

    console.log(`Read request from address ${address}: register ${startRegister} (${quantity} registers)`);

    // Check if address is in valid range
    if (address >= START_ADDRESS && address <= END_ADDRESS) {
        // For addresses 10-50, always respond with exactly 2 registers starting from our target register
        const responseStart = REGISTER_ADDRESS;
        const responseQuantity = 2; // Always return 2 words

        // Ensure buffer has correct values
        inputRegisters.writeUInt16BE(REGISTER_VALUE, REGISTER_ADDRESS * 2);
        inputRegisters.writeUInt16BE(0x0000, (REGISTER_ADDRESS + 1) * 2);

        // Return exactly 2 registers (4 bytes) from buffer
        const response = inputRegisters.slice(responseStart * 2, (responseStart + responseQuantity) * 2);
        console.log(`Responding with 2 registers (${response.length} bytes): 0x${response.readUInt16BE(0).toString(16).toUpperCase()} 0x${response.readUInt16BE(2).toString(16).toUpperCase()}`);
        reply(null, response);
    } else {
        console.log(`Address ${address} not in valid range (${START_ADDRESS}-${END_ADDRESS})`);
        // Return exception for invalid address
        reply(new Error('Invalid unit address'));
    }
});

// Handle connection
server.on('connection', (client) => {
    console.log('Client connected');
});

// Handle close
server.on('close', () => {
    console.log('Client disconnected');
});

// Start the server (serial port is already opened)
console.log(`Modbus RTU server started on ${CONFIG.port}`);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    serialPort.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    serialPort.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});