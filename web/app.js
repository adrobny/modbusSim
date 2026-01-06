// Configuration
let CONFIG = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
};

let REGISTER_ADDRESS = 0x400;
let REGISTER_VALUE = 0x100;
let START_ADDRESS = 10;
let END_ADDRESS = 11;
const MAX_REGISTER = 10000;

// Web Serial API
let port = null;
let reader = null;
let writer = null;
let inputRegisters = new Uint16Array(MAX_REGISTER);
let lastRequestAddress = null;

// Initialize registers
function initRegisters() {
    for (let i = 0; i < MAX_REGISTER; i++) {
        inputRegisters[i] = i & 0xFFFF;
    }
    inputRegisters[REGISTER_ADDRESS] = REGISTER_VALUE;
}

// CRC16 calculation for Modbus RTU
function calculateCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

// Log function
function log(message, type = 'info') {
    const logDiv = document.getElementById('log');
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${time}] ${message}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// Update status
function updateStatus(status, portInfo = '') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = status;
    statusEl.className = status === 'Připojeno' ? 'status connected' : 'status';
    document.getElementById('portInfo').textContent = portInfo;
}

// Connect to serial port
async function connect() {
    if (!navigator.serial) {
        alert('Web Serial API není podporováno. Použijte Chrome nebo Edge.');
        return;
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({
            baudRate: CONFIG.baudRate,
            dataBits: CONFIG.dataBits,
            stopBits: CONFIG.stopBits,
            parity: CONFIG.parity
        });

        const portInfo = port.getInfo();
        updateStatus('Připojeno', `Port připojen (Baud: ${CONFIG.baudRate})`);
        log('Připojeno k sériovému portu', 'success');
        
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('disconnectBtn').disabled = false;

        // Start reading
        reader = port.readable.getReader();
        writer = port.writable.getWriter();
        
        readLoop();
    } catch (error) {
        log(`Chyba připojení: ${error.message}`, 'error');
        updateStatus('Chyba připojení');
    }
}

// Disconnect from serial port
async function disconnect() {
    if (reader) {
        try {
            await reader.cancel();
        } catch (e) {}
        reader.releaseLock();
        reader = null;
    }
    if (writer) {
        writer.releaseLock();
        writer = null;
    }
    if (port) {
        try {
            await port.close();
        } catch (e) {}
        port = null;
    }
    
    updateStatus('Odpojeno');
    log('Odpojeno od sériového portu', 'info');
    
    document.getElementById('connectBtn').disabled = false;
    document.getElementById('disconnectBtn').disabled = true;
}

// Calculate frame timeout based on baud rate (3.5 character times)
function getFrameTimeout(baudRate) {
    // 3.5 character times = 3.5 * 11 bits (1 start + 8 data + 1 parity + 1 stop)
    // Time in milliseconds = (3.5 * 11 * 1000) / baudRate
    const timeout = Math.ceil((3.5 * 11 * 1000) / baudRate);
    // Use minimum 5ms and add safety margin
    return Math.max(timeout + 2, 5);
}

// Read loop
async function readLoop() {
    const buffer = [];
    let frameTimeout = null;
    let lastByteTime = 0;
    
    while (port && port.readable) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            
            const currentTime = Date.now();
            
            // Add received bytes to buffer
            buffer.push(...value);
            
            // Clear existing timeout
            if (frameTimeout) {
                clearTimeout(frameTimeout);
                frameTimeout = null;
            }
            
            // Calculate timeout based on baud rate
            const timeout = getFrameTimeout(CONFIG.baudRate);
            
            // Check if we can process a complete frame immediately
            // Try to parse frames from buffer while waiting for more data
            processFramesFromBuffer(buffer);
            
            // Wait for frame completion (3.5 character times)
            frameTimeout = setTimeout(() => {
                if (buffer.length > 0) {
                    // Try to process all complete frames from buffer
                    processFramesFromBuffer(buffer);
                }
            }, timeout);
            
            lastByteTime = currentTime;
        } catch (error) {
            log(`Chyba čtení: ${error.message}`, 'error');
            break;
        }
    }
}

// Process complete frames from buffer
function processFramesFromBuffer(buffer) {
    while (buffer.length >= 4) { // Minimum frame size
        // Try to find and process a complete frame
        const frame = extractFrame(buffer);
        if (frame) {
            processReceivedData(frame);
        } else {
            // No complete frame found, wait for more data
            break;
        }
    }
}

// Extract a complete Modbus RTU frame from buffer
function extractFrame(buffer) {
    if (buffer.length < 4) return null; // Minimum frame size
    
    const address = buffer[0];
    const functionCode = buffer[1];
    
    // Calculate expected frame length based on function code
    let expectedLength = 0;
    
    if (functionCode === 0x04) { // Read Input Registers
        if (buffer.length < 8) return null; // Need at least: addr(1) + FC(1) + start(2) + qty(2) + CRC(2)
        const quantity = (buffer[4] << 8) | buffer[5];
        expectedLength = 8; // addr + FC + start_reg(2) + quantity(2) + CRC(2)
    } else if (functionCode === 0x03) { // Read Holding Registers
        if (buffer.length < 8) return null;
        const quantity = (buffer[4] << 8) | buffer[5];
        expectedLength = 8;
    } else if (functionCode >= 0x01 && functionCode <= 0x06) {
        // Single register/coil operations: addr + FC + addr(2) + value(2) + CRC(2) = 8 bytes
        expectedLength = 8;
    } else {
        // Unknown function code, try minimum frame
        expectedLength = 4;
    }
    
    // Check if we have enough data for complete frame
    if (buffer.length < expectedLength) {
        return null; // Wait for more data
    }
    
    // Extract frame
    const frame = new Uint8Array(buffer.slice(0, expectedLength));
    
    // Verify CRC
    const receivedCRC = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
    const calculatedCRC = calculateCRC16(frame.slice(0, -2));
    
    if (receivedCRC === calculatedCRC) {
        // Valid frame found, remove it from buffer
        buffer.splice(0, expectedLength);
        return frame;
    } else {
        // CRC doesn't match - might be two frames merged
        // Try to find next possible frame start (look for valid Modbus address)
        for (let i = 1; i < Math.min(buffer.length - 3, 20); i++) {
            // Check if byte at position i could be a valid address (1-247)
            const testAddress = buffer[i];
            if (testAddress >= 1 && testAddress <= 247) {
                // Try to extract frame starting from this position
                const testFrame = extractFrameFromPosition(buffer, i);
                if (testFrame) {
                    // Found valid frame, log the issue and remove everything before it
                    log(`[VAROVÁNÍ] Detekovány slepené pakety - nalezen platný rámec na pozici ${i}, odstraňuji ${i} bytů před ním`, 'warning');
                    buffer.splice(0, i);
                    return testFrame;
                }
            }
        }
        
        // No valid frame found starting from any position
        // This might be corrupted data, remove first byte and try again
        log(`[VAROVÁNÍ] Neplatný CRC a žádný další platný rámec nenalezen - odstraňuji první byte (0x${buffer[0].toString(16).toUpperCase()})`, 'warning');
        buffer.shift();
        return null;
    }
}

// Try to extract frame from specific position
function extractFrameFromPosition(buffer, startPos) {
    if (buffer.length < startPos + 4) return null;
    
    const address = buffer[startPos];
    const functionCode = buffer[startPos + 1];
    
    let expectedLength = 0;
    if (functionCode === 0x04 || functionCode === 0x03) {
        if (buffer.length < startPos + 8) return null;
        expectedLength = 8;
    } else if (functionCode >= 0x01 && functionCode <= 0x06) {
        expectedLength = 8;
    } else {
        expectedLength = 4;
    }
    
    if (buffer.length < startPos + expectedLength) return null;
    
    const frame = new Uint8Array(buffer.slice(startPos, startPos + expectedLength));
    const receivedCRC = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
    const calculatedCRC = calculateCRC16(frame.slice(0, -2));
    
    if (receivedCRC === calculatedCRC) {
        return frame;
    }
    
    return null;
}

// Process received Modbus RTU frame
function processReceivedData(data) {
    if (data.length < 4) return; // Minimum frame size
    
    const address = data[0];
    // Store address for potential use, but we'll use address from request data directly
    const previousAddress = lastRequestAddress;
    lastRequestAddress = address;
    
    const hexString = Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    log(`[PŘÍJEM] Adresa: ${address}, Data: ${hexString}, Délka: ${data.length} bytů`);
    
    if (previousAddress !== null && previousAddress !== address) {
        log(`[INFO] Předchozí adresa byla ${previousAddress}, nová adresa je ${address}`, 'info');
    }
    
    // Check if address is in valid range
    if (address < START_ADDRESS || address > END_ADDRESS) {
        log(`[BLOKOVÁNO] Adresa ${address} není v platném rozsahu (${START_ADDRESS}-${END_ADDRESS}) - požadavek ignorován`, 'warning');
        lastRequestAddress = null; // Reset after blocking
        return;
    }
    
    // Verify CRC
    const receivedCRC = data[data.length - 2] | (data[data.length - 1] << 8);
    const calculatedCRC = calculateCRC16(data.slice(0, -2));
    
    if (receivedCRC !== calculatedCRC) {
        log(`[CHYBA] Neplatný CRC: přijato 0x${receivedCRC.toString(16)}, vypočteno 0x${calculatedCRC.toString(16)}`, 'error');
        lastRequestAddress = null; // Reset after error
        return;
    }
    
    // Process request - pass the data array, address will be extracted from data[0] in the handler
    const functionCode = data[1];
    
    if (functionCode === 0x04) { // Read Input Registers
        processReadInputRegisters(data, address);
    } else {
        log(`[NEPODPOROVÁNO] Function code: 0x${functionCode.toString(16)}`, 'warning');
        lastRequestAddress = null; // Reset after unsupported function
    }
}

// Process Read Input Registers request
function processReadInputRegisters(request, address) {
    const startRegister = (request[2] << 8) | request[3];
    const quantity = (request[4] << 8) | request[5];
    
    // Ensure we use the correct address from the request
    const requestAddress = request[0]; // Get address directly from request data
    if (requestAddress !== address) {
        log(`[VAROVÁNÍ] Adresa z parametru ${address} se liší od adresy v requestu ${requestAddress} - používám adresu z requestu`, 'warning');
    }
    const correctAddress = requestAddress; // Use address from request data
    
    log(`[POŽADAVEK] Adresa: ${correctAddress}, Registr: ${startRegister} (0x${startRegister.toString(16).toUpperCase()}), Počet: ${quantity}`);
    
    // Update buffer values
    for (let i = 0; i < quantity; i++) {
        const registerAddr = startRegister + i;
        if (registerAddr >= MAX_REGISTER) continue;
        
        if (registerAddr === REGISTER_ADDRESS) {
            inputRegisters[registerAddr] = REGISTER_VALUE;
            log(`[BUFFER] Registr ${registerAddr} (0x${registerAddr.toString(16).toUpperCase()}): hodnota 0x${REGISTER_VALUE.toString(16).toUpperCase()} (speciální)`);
        } else {
            inputRegisters[registerAddr] = registerAddr & 0xFFFF;
            log(`[BUFFER] Registr ${registerAddr} (0x${registerAddr.toString(16).toUpperCase()}): hodnota 0x${registerAddr.toString(16).toUpperCase()} (stejná jako adresa)`);
        }
    }
    
    // Build response - use correct address from request
    const response = new Uint8Array(3 + quantity * 2 + 2);
    response[0] = correctAddress; // Use address from request, not parameter
    response[1] = 0x04; // Function code
    response[2] = quantity * 2; // Byte count
    
    // Add register values
    for (let i = 0; i < quantity; i++) {
        const regValue = inputRegisters[startRegister + i];
        response[3 + i * 2] = (regValue >> 8) & 0xFF;
        response[3 + i * 2 + 1] = regValue & 0xFF;
    }
    
    // Calculate and add CRC
    const crc = calculateCRC16(response.slice(0, -2));
    response[response.length - 2] = crc & 0xFF;
    response[response.length - 1] = (crc >> 8) & 0xFF;
    
    const hexString = Array.from(response).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    log(`[ODESLÁNO] Adresa: ${correctAddress}, FC: 0x04, Byte count: ${quantity * 2}, Data bytes: ${quantity * 2}, Celkem: ${response.length} bytů`);
    log(`[ODESLÁNO HEX] ${hexString}`);
    
    // Send response
    sendResponse(response);
}

// Send response
async function sendResponse(data) {
    if (!writer) return;
    
    try {
        await writer.write(data);
    } catch (error) {
        log(`Chyba odesílání: ${error.message}`, 'error');
    }
}

// Event listeners
document.getElementById('connectBtn').addEventListener('click', connect);
document.getElementById('disconnectBtn').addEventListener('click', disconnect);
document.getElementById('clearLogBtn').addEventListener('click', () => {
    document.getElementById('log').innerHTML = '';
});

// Update config from UI
document.getElementById('baudRate').addEventListener('change', (e) => {
    CONFIG.baudRate = parseInt(e.target.value);
    log(`Baud rate nastaven na: ${CONFIG.baudRate}`);
});

document.getElementById('startAddress').addEventListener('change', (e) => {
    START_ADDRESS = parseInt(e.target.value);
    log(`Start adresa nastavena na: ${START_ADDRESS}`);
});

document.getElementById('endAddress').addEventListener('change', (e) => {
    END_ADDRESS = parseInt(e.target.value);
    log(`End adresa nastavena na: ${END_ADDRESS}`);
});

document.getElementById('registerAddress').addEventListener('change', (e) => {
    REGISTER_ADDRESS = parseInt(e.target.value, 16);
    inputRegisters[REGISTER_ADDRESS] = REGISTER_VALUE;
    log(`Registr nastaven na: 0x${REGISTER_ADDRESS.toString(16).toUpperCase()}`);
});

document.getElementById('registerValue').addEventListener('change', (e) => {
    REGISTER_VALUE = parseInt(e.target.value, 16);
    inputRegisters[REGISTER_ADDRESS] = REGISTER_VALUE;
    log(`Hodnota registru nastavena na: 0x${REGISTER_VALUE.toString(16).toUpperCase()}`);
});

// Initialize
initRegisters();
log('Modbus RTU Simulator inicializován', 'success');
log('Použijte Chrome nebo Edge pro Web Serial API podporu', 'info');


