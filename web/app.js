// Configuration & State
let CONFIG = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
};

let device = {
    name: "Moje Zařízení",
    identity: {
        vendorName: "MyCompany",
        productCode: "ModbusSim",
        majorMinorRevision: "1.0",
        vendorUrl: "https://example.com",
        productName: "Universal Modbus Simulator",
        modelName: "Sim-2000",
        userApplicationName: "SimulatorApp"
    },
    registers: [
        { address: 10, type: 'HoldingRegister', dataType: 'uint16', value: 1234, name: 'Test Register' }
    ]
};

// Web Serial API
let port = null;
let reader = null;
let writer = null;
let keepReading = false;

// DOM Elements
const elements = {
    baudRate: document.getElementById('baudRate'),
    dataBits: document.getElementById('dataBits'),
    stopBits: document.getElementById('stopBits'),
    parity: document.getElementById('parity'),
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    status: document.getElementById('status'),
    portInfo: document.getElementById('portInfo'),
    log: document.getElementById('log'),
    clearLogBtn: document.getElementById('clearLogBtn'),

    // Check if elements exist (legacy safety)
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    fileInput: document.getElementById('fileInput'),
    deviceName: document.getElementById('deviceName'),
    addRegisterBtn: document.getElementById('addRegisterBtn'),
    registersTable: document.getElementById('registersBody'),

    // Modal
    modal: document.getElementById('registerModal'),
    modalTitle: document.getElementById('modalTitle'),
    registerForm: document.getElementById('registerForm'),
    regAddress: document.getElementById('regAddress'),
    regType: document.getElementById('regType'),
    regDataType: document.getElementById('regDataType'),
    regValue: document.getElementById('regValue'),
    regName: document.getElementById('regName'),
    editIndex: document.getElementById('editIndex'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    closeModal: document.querySelector('.close')
};

// --- CRC16 Calculation ---
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

// --- Logging ---
function log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${time}] ${message}`;
    elements.log.appendChild(entry);
    elements.log.scrollTop = elements.log.scrollHeight;
}

function updateStatus(status, portInfo = '') {
    elements.status.textContent = status;
    elements.status.className = status === 'Připojeno' ? 'status connected' : 'status';
    elements.portInfo.textContent = portInfo;
}

// --- UI rendering ---
function renderRegisters() {
    if (!elements.registersTable) return;

    elements.registersTable.innerHTML = '';
    device.registers.forEach((reg, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${reg.address} (0x${reg.address.toString(16).toUpperCase()})</td>
            <td>${reg.type}</td>
            <td>${reg.dataType}</td>
            <td>${reg.value}</td>
            <td>${reg.name || ''}</td>
            <td class="action-buttons">
                <button class="btn btn-small btn-info" onclick="editRegister(${index})">Upravit</button>
                <button class="btn btn-small btn-danger" onclick="deleteRegister(${index})">Smazat</button>
            </td>
        `;
        elements.registersTable.appendChild(row);
    });
}

// --- Device Management ---
function saveDeviceConfig() {
    // In a real app we might persist to localStorage
    // localStorage.setItem('modbusSimulatorDevice', JSON.stringify(device));
}

window.editRegister = function (index) {
    const reg = device.registers[index];
    elements.editIndex.value = index;
    elements.regAddress.value = reg.address;
    elements.regType.value = reg.type;
    elements.regDataType.value = reg.dataType;
    elements.regValue.value = reg.value;
    elements.regName.value = reg.name || '';

    elements.modalTitle.textContent = 'Upravit Registr';
    elements.modal.classList.add('active');
};

window.deleteRegister = function (index) {
    if (confirm('Opravdu smazat tento registr?')) {
        device.registers.splice(index, 1);
        renderRegisters();
    }
};

function openAddModal() {
    elements.editIndex.value = -1;
    elements.regAddress.value = '';
    elements.regValue.value = '0';
    elements.regName.value = '';
    elements.modalTitle.textContent = 'Přidat Registr';
    elements.modal.classList.add('active');
}

function closeModal() {
    elements.modal.classList.remove('active');
}

// --- Import / Export ---
function exportConfig() {
    // Update name from input before export
    device.name = elements.deviceName.value;

    // Sanitize filename: replace spaces with underscores, remove non-alphanumeric chars (except dash/underscore)
    let filename = device.name.replace(/[^a-z0-9\-_]/gi, '_').replace(/_{2,}/g, '_');
    if (!filename) filename = "device";

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(device, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${filename}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const config = JSON.parse(e.target.result);
            if (!config.registers) throw new Error("Neplatný formát");
            device = config;
            elements.deviceName.value = device.name || "Nové Zařízení";
            renderRegisters();
            log('Konfigurace importována', 'success');
        } catch (error) {
            alert('Chyba při importu: ' + error.message);
        }
    };
    reader.readAsText(file);
    elements.fileInput.value = ''; // Reset input
}

// --- Event Listeners ---
if (elements.addRegisterBtn) elements.addRegisterBtn.addEventListener('click', openAddModal);
if (elements.cancelModalBtn) elements.cancelModalBtn.addEventListener('click', closeModal);
if (elements.closeModal) elements.closeModal.addEventListener('click', closeModal);

if (elements.registerForm) {
    elements.registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const index = parseInt(elements.editIndex.value);

        const newReg = {
            address: parseInt(elements.regAddress.value),
            type: elements.regType.value,
            dataType: elements.regDataType.value,
            value: parseFloat(elements.regValue.value), // Simple parsing, could be improved
            name: elements.regName.value
        };

        if (elements.regDataType.value === 'boolean') {
            newReg.value = elements.regValue.value.toLowerCase() === 'true' || elements.regValue.value === '1';
        }

        if (index >= 0) {
            device.registers[index] = newReg;
        } else {
            device.registers.push(newReg);
        }

        device.registers.sort((a, b) => a.address - b.address); // Sort by address
        renderRegisters();
        closeModal();
    });
}

if (elements.exportBtn) elements.exportBtn.addEventListener('click', exportConfig);
if (elements.importBtn) elements.importBtn.addEventListener('click', () => elements.fileInput.click());
if (elements.fileInput) elements.fileInput.addEventListener('change', importConfig);
if (elements.deviceName) elements.deviceName.addEventListener('change', (e) => device.name = e.target.value);

elements.baudRate.addEventListener('change', (e) => {
    CONFIG.baudRate = parseInt(e.target.value);
    log(`Baud rate nastaven na: ${CONFIG.baudRate}`);
});

if (elements.dataBits) {
    elements.dataBits.addEventListener('change', (e) => {
        CONFIG.dataBits = parseInt(e.target.value);
        log(`Data Bits nastaveno na: ${CONFIG.dataBits}`);
    });
}

if (elements.stopBits) {
    elements.stopBits.addEventListener('change', (e) => {
        CONFIG.stopBits = parseInt(e.target.value);
        log(`Stop Bits nastaveno na: ${CONFIG.stopBits}`);
    });
}

if (elements.parity) {
    elements.parity.addEventListener('change', (e) => {
        CONFIG.parity = e.target.value;
        log(`Parity nastaveno na: ${CONFIG.parity}`);
    });
}

elements.connectBtn.addEventListener('click', connect);
elements.disconnectBtn.addEventListener('click', disconnect);
elements.clearLogBtn.addEventListener('click', () => elements.log.innerHTML = '');

// --- Serial & Modbus Logic ---

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

        const info = port.getInfo();
        updateStatus('Připojeno', `Port připojen (${CONFIG.baudRate}/${CONFIG.dataBits}/${CONFIG.parity}/${CONFIG.stopBits})`);
        log(`Připojeno k sériovému portu (${CONFIG.baudRate}, ${CONFIG.dataBits}, ${CONFIG.parity}, ${CONFIG.stopBits})`, 'success');

        elements.connectBtn.disabled = true;
        elements.disconnectBtn.disabled = false;

        keepReading = true;
        reader = port.readable.getReader();
        writer = port.writable.getWriter();

        readLoop();
    } catch (error) {
        log(`Chyba připojení: ${error.message}`, 'error');
        updateStatus('Chyba připojení');
    }
}

async function disconnect() {
    keepReading = false;
    if (reader) {
        try {
            await reader.cancel();
        } catch (e) { }
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
        } catch (e) { }
        port = null;
    }

    updateStatus('Odpojeno');
    log('Odpojeno od sériového portu', 'info');

    elements.connectBtn.disabled = false;
    elements.disconnectBtn.disabled = true;
}

// Calculate frame timeout based on baud rate (3.5 character times)
function getFrameTimeout(baudRate) {
    const timeout = Math.ceil((3.5 * 11 * 1000) / baudRate);
    return Math.max(timeout + 2, 5);
}

async function readLoop() {
    const buffer = [];
    let frameTimeout = null;

    while (port && port.readable && keepReading) {
        try {
            const { value, done } = await reader.read();
            if (done) break;

            buffer.push(...value);

            if (frameTimeout) {
                clearTimeout(frameTimeout);
                frameTimeout = null;
            }

            const timeout = getFrameTimeout(CONFIG.baudRate);

            // Try to process right away
            processFramesFromBuffer(buffer);

            // Wait for silence
            frameTimeout = setTimeout(() => {
                if (buffer.length > 0) {
                    processFramesFromBuffer(buffer);
                }
            }, timeout);

        } catch (error) {
            log(`Chyba čtení: ${error.message}`, 'error');
            break;
        }
    }
}

function processFramesFromBuffer(buffer) {
    while (buffer.length >= 4) {
        const frame = extractFrame(buffer);
        if (frame) {
            processReceivedData(frame);
        } else {
            break;
        }
    }
}

function extractFrame(buffer) {
    if (buffer.length < 4) return null;

    const address = buffer[0];
    const functionCode = buffer[1];

    // We assume standard Modbus commands 
    // 03 (Read Holding), 04 (Read Input), 06 (Write Single), 16 (Write Multiple)

    let expectedLength = 0;

    if (functionCode === 0x03 || functionCode === 0x04) {
        // Read: Addr(1) + FC(1) + Start(2) + Qty(2) + CRC(2) = 8 bytes
        expectedLength = 8;
    } else if (functionCode === 0x06) {
        // Write Single: Addr(1) + FC(1) + Reg(2) + Val(2) + CRC(2) = 8 bytes
        expectedLength = 8;
    } else if (functionCode === 0x10) { // 16 decimal = 0x10 hex (Write Multiple)
        if (buffer.length < 7) return null; // Need enough bytes to read byte count
        const byteCount = buffer[6];
        // Addr(1) + FC(1) + Start(2) + Qty(2) + ByteCount(1) + Bytes(N) + CRC(2)
        expectedLength = 9 + byteCount;
    } else {
        // Unknown or unsupported - minimal check
        expectedLength = 4;
    }

    if (buffer.length < expectedLength) return null;

    const frame = new Uint8Array(buffer.slice(0, expectedLength));
    const receivedCRC = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
    const calculatedCRC = calculateCRC16(frame.slice(0, -2));

    if (receivedCRC === calculatedCRC) {
        buffer.splice(0, expectedLength);
        return frame;
    } else {
        // CRC Fail - simple recovery: drop one byte
        // Ideally we should search for next potential valid start, but this is simple sim
        buffer.shift();
        return null; // Retry next loop
    }
}

function processReceivedData(data) {
    const address = data[0];
    const functionCode = data[1];

    const hexString = Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    log(`[PŘÍJEM] Adresa: ${address}, FC: 0x${functionCode.toString(16)}, Data: ${hexString}`);

    // Verify Address? We could implement an address filter in the device config too.
    // For now, let's assume we reply to everything or check if we have registers.

    if (functionCode === 0x03 || functionCode === 0x04) {
        handleReadRegisters(data, address, functionCode);
    } else if (functionCode === 0x06) {
        handleWriteSingleRegister(data, address);
    } else if (functionCode === 0x10) {
        // handleWriteMultipleRegisters(data, address);
        log('Write Multiple not fully implemented yet in UI sim', 'warning');
    } else {
        log(`Nepodporovaný FC: ${functionCode}`, 'warning');
    }
}

function handleReadRegisters(request, address, functionCode) {
    // Both 0x03 and 0x04 
    const startRegister = (request[2] << 8) | request[3];
    const quantity = (request[4] << 8) | request[5];

    log(`[REQ] Read ${functionCode === 3 ? 'Holding' : 'Input'} @ ${startRegister}, Qty: ${quantity}`);

    // Validate range
    if (quantity < 1 || quantity > 125) {
        // Send Exception?
        return;
    }

    const byteCount = quantity * 2;
    const response = new Uint8Array(3 + byteCount + 2);
    response[0] = address;
    response[1] = functionCode;
    response[2] = byteCount;

    const dataView = new DataView(response.buffer);

    // Fill data
    for (let i = 0; i < quantity; i++) {
        const currentAddr = startRegister + i;
        const regDef = device.registers.find(r => r.address === currentAddr);

        // Default value if not found
        let value = 0;

        if (regDef) {
            // Check type match?
            // if (functionCode === 3 && regDef.type !== 'HoldingRegister') ... strictly speaking
            // But let's be lenient or check type

            // Handle multi-word types. 
            // If we request 10, and 10 is Float32, we return 1st word.
            // If we request 11, and 10 was Float32, we return 2nd word.

            // This sparse lookup is naive for multi-word.
            // A better way is to find the register that *covers* this address.

            // Simplified logic: If exact match found, return its value (casted to u16).
            // If it's a multi-word value, this simulation might need more complex memory map.

            // For now: Support only 1-to-1 mapping or manual split in UI.
            // If user defines Float32 at 10, we expect 10 and 11 to be read.
            // We can calculate values on the fly.

            value = getRegisterValue16Bit(currentAddr);
        }

        dataView.setUint16(3 + i * 2, value, false); // Big Endian
    }

    // CRC
    const crc = calculateCRC16(response.slice(0, -2));
    response[response.length - 2] = crc & 0xFF;
    response[response.length - 1] = (crc >> 8) & 0xFF;

    sendResponse(response);
}

function getRegisterValue16Bit(address) {
    // Find register that starts at or before this address
    // Sort registers first to be sure? They are sorted on add.

    const reg = device.registers.find(r => r.address === address);
    if (reg) {
        // It's the start of a register.
        return convertValueToWord(reg, 0);
    }

    // Check if it's the second word of a 32-bit/64-bit register
    const prevReg = device.registers.find(r =>
        (r.dataType === 'float32' || r.dataType === 'uint32' || r.dataType === 'int32') && r.address === address - 1
    );
    if (prevReg) return convertValueToWord(prevReg, 1);

    // Check 64-bit...
    // ... logic for float64 (4 registers) ...
    // Simplified for now.

    return 0;
}

function convertValueToWord(reg, wordOffset) {
    const buffer = new ArrayBuffer(8); // Max size needed
    const view = new DataView(buffer);

    switch (reg.dataType) {
        case 'float32':
            view.setFloat32(0, reg.value, false); // Big Endian
            return view.getUint16(wordOffset * 2, false);
        case 'uint32':
            view.setUint32(0, reg.value, false);
            return view.getUint16(wordOffset * 2, false);
        case 'int32':
            view.setInt32(0, reg.value, false);
            return view.getUint16(wordOffset * 2, false);
        case 'float64':
            view.setFloat64(0, reg.value, false);
            return view.getUint16(wordOffset * 2, false);
        case 'uint16':
        default:
            return reg.value & 0xFFFF;
    }
}

function handleWriteSingleRegister(request, address) {
    const regAddr = (request[2] << 8) | request[3];
    const value = (request[4] << 8) | request[5];

    log(`[Write] Addr: ${regAddr}, Val: ${value}`);

    // Update model
    const reg = device.registers.find(r => r.address === regAddr);
    if (reg) {
        // If it's a simple type, update it
        if (reg.dataType === 'uint16' || reg.dataType === 'int16') {
            // Treat as signed if int16?
            if (reg.dataType === 'int16') {
                // Convert to signed
                const int16 = new Int16Array([value])[0];
                reg.value = int16;
            } else {
                reg.value = value;
            }
        } else {
            // Partial write to multi-word? Complex.
            log('Partial write to multi-word register ignored in simplified view', 'warning');
        }
        renderRegisters(); // Refresh UI
    } else {
        // Auto-create register on write? Maybe useful.
        // Or just ignore/Exception.
        // For a simulator, auto-creation is a nice feature if enabled. 
        // Let's just log for now.
        log('Writing to undefined register', 'warning');
    }

    // Echo request as response
    sendResponse(request);
}

async function sendResponse(data) {
    if (!writer) return;
    try {
        await writer.write(data);
        const hexString = Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        log(`[ODESLÁNO] ${hexString}`);
    } catch (error) {
        log(`Chyba odesílání: ${error.message}`, 'error');
    }
}

// Init
renderRegisters();
log('Generic Modbus Simulator Ready');



