const Modbus = require('jsmodbus');
const SerialPort = require('serialport');
const fs = require('fs');
const path = require('path');
const ModbusDevice = require('./lib/Device');

// Configuration
const CONFIG = {
    port: process.env.COM_PORT || 'COM12', // Default COM port
    baudRate: parseInt(process.env.BAUD_RATE) || 9600, // Standard Modbus RTU baud rate
    dataBits: parseInt(process.env.DATA_BITS) || 8,
    stopBits: parseFloat(process.env.STOP_BITS) || 1,
    parity: process.env.PARITY || 'none',
    configFile: process.env.CONFIG_FILE || 'device.json'
};

console.log('Modbus RTU Simulator');
console.log(`COM Port: ${CONFIG.port}`);
console.log(`Port Config: ${CONFIG.baudRate} baud, ${CONFIG.dataBits} data bits, ${CONFIG.stopBits} stop bits, ${CONFIG.parity} parity`);

// Load Device Configuration
let device;
try {
    const configPath = path.resolve(CONFIG.configFile);
    if (fs.existsSync(configPath)) {
        console.log(`Loading configuration from ${CONFIG.configFile}`);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        device = new ModbusDevice(config);
        console.log(`Device '${device.name}' initialized.`);
    } else {
        console.warn(`Configuration file ${CONFIG.configFile} not found. Using empty device.`);
        device = new ModbusDevice({ name: 'Empty Device', registers: [] });
    }
} catch (e) {
    console.error('Error loading configuration:', e.message);
    process.exit(1);
}

// Create serial port
const serialPort = new SerialPort.SerialPort({
    path: CONFIG.port,
    baudRate: CONFIG.baudRate,
    dataBits: CONFIG.dataBits,
    parity: CONFIG.parity
});

const attachHandlers = require('./lib/ServerHandler');

// Apply Monkey-Patch for Custom Function Codes
require('./lib/ModbusPatch')();

// Create Modbus RTU server
// We pass null buffers to disable default handling and use our own listeners
const serverOptions = {
    coils: null,
    discrete: null,
    holding: null,
    input: null
};
const server = new Modbus.server.RTU(serialPort, serverOptions);

server.on('connection', (client) => {
    console.log('Client connected');
});

server.on('close', () => {
    console.log('Client disconnected');
});

// Attach custom request handlers
attachHandlers(server, device);

server.on('postWriteSingleRegister', (value) => {
    // This event doesn't give us the address easily in all versions, 
    // but for debugging it's useful to know something happened.
    console.log('Write Single Register request processed');
});

// Start the server (serial port is already opened)
console.log(`Modbus RTU server started on ${CONFIG.port}`);

// Watch for config changes
fs.watch(CONFIG.configFile, (eventType, filename) => {
    if (filename && eventType === 'change') {
        console.log(`Configuration changed. Reloading...`);
        try {
            const config = JSON.parse(fs.readFileSync(CONFIG.configFile, 'utf8'));
            // Re-initialize device with new config
            // Note: This replaces the references, but jsmodbus server holds references to the old buffers!
            // We need to update the existing buffers or restart the server.
            // Restarting the server is complicated with open serial port.
            // Updating buffers in place is better if we keep the same buffer objects.
            // But ModbusDevice creates new buffers.
            // Let's just exit and let the user restart, or Implement a hot-reload if critical.
            // For now, simple exit to restart is safer.
            console.log('Config updated. Please restart the simulator to apply changes completely.');
        } catch (e) {
            console.error('Error reloading config:', e);
        }
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    serialPort.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});
