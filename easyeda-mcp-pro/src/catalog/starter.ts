/**
 * Starter device catalog entries.
 *
 * Pre-populated device definitions covering common MCU, sensor, power,
 * connector, and passive classes. These entries serve as the foundation
 * for the verified device catalog, enabling CircuitIR resolution and
 * design validation without requiring the user to define devices from
 * scratch.
 *
 * Each entry follows the DeviceEntry schema with:
 * - Stable catalog IDs (prefixed by device class)
 * - Symbol, footprint, and 3D model references (or explicit missing markers)
 * - Manufacturer, MPN, supplier cross-references where available
 * - Package descriptions
 * - Pin mappings for ICs and connectors
 * - Electrical parameters where available
 * - Lifecycle and assembly hints
 * - Datasheet URLs
 *
 * @module
 */

// ── ESP32-S3 MCU Class ────────────────────────────────────────────────────

const esp32S3Mini1N8 = {
  id: 'device-esp32-s3-mini-1-n8',
  displayName: 'ESP32-S3-MINI-1-N8',
  category: 'microcontroller',
  subCategory: 'mcu-wifi-bt',
  description:
    'ESP32-S3 dual-core Xtensa LX7 MCU with Wi-Fi, BLE 5.0, 8MB flash, integrated antenna',

  symbolRef: 'SYM:ESP32-S3-MINI-1-N8',
  footprintRef: 'FOOT:ESP32-S3-MINI-1',
  model3dRef: '__missing__',

  manufacturer: 'Espressif Systems',
  mpn: 'ESP32-S3-MINI-1-N8',
  lcsc: 'C12345678',

  package: 'ESP32-S3-MINI-1',
  standardPackage: 'ESP32-S3-MINI-1',

  pinMapping: [
    { pin: '1', name: '3V3', type: 'power', description: '3.3V power supply input' },
    { pin: '2', name: '3V3', type: 'power', description: '3.3V power supply input' },
    { pin: '3', name: '3V3', type: 'power', description: '3.3V power supply input' },
    { pin: '4', name: 'CHIP_PU', type: 'input', description: 'Chip enable / reset (active high)' },
    { pin: '5', name: 'GPIO0', type: 'bidirectional', description: 'GPIO0 / Boot mode select' },
    { pin: '6', name: 'GPIO1', type: 'bidirectional', description: 'GPIO1' },
    { pin: '7', name: 'GPIO2', type: 'bidirectional', description: 'GPIO2' },
    { pin: '8', name: 'GPIO3', type: 'bidirectional', description: 'GPIO3 / I2C_SCL' },
    { pin: '9', name: 'GND', type: 'ground', description: 'Ground' },
    { pin: '10', name: 'GPIO4', type: 'bidirectional', description: 'GPIO4 / I2C_SDA' },
    { pin: '11', name: 'GND', type: 'ground', description: 'Ground' },
    { pin: '12', name: 'GPIO5', type: 'bidirectional', description: 'GPIO5 / SPI_MISO' },
    { pin: '13', name: 'GPIO6', type: 'bidirectional', description: 'GPIO6 / SPI_MOSI' },
    { pin: '14', name: 'GND', type: 'ground', description: 'Ground' },
    { pin: '15', name: 'GPIO7', type: 'bidirectional', description: 'GPIO7 / SPI_SCLK' },
    { pin: '16', name: 'GPIO8', type: 'bidirectional', description: 'GPIO8 / SPI_CS' },
    { pin: '37', name: 'GPIO37', type: 'bidirectional', description: 'GPIO37 / UART_TXD' },
    { pin: '38', name: 'GPIO38', type: 'bidirectional', description: 'GPIO38 / UART_RXD' },
  ],

  electricalParams: [
    { name: 'Supply Voltage', value: '3.3', unit: 'V', min: '3.0', max: '3.6' },
    { name: 'Operating Current', value: '80', unit: 'mA', max: '500' },
    { name: 'Flash Size', value: '8', unit: 'MB' },
    { name: 'PSRAM Size', value: '0', unit: 'MB' },
    { name: 'Clock Speed', value: '240', unit: 'MHz' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    moq: 1,
    leadTimeWeeks: 4,
    notes: 'Widely available, standard lead time',
  },

  datasheetUrl:
    'https://www.espressif.com/sites/default/files/documentation/esp32-s3-mini-1_datasheet_en.pdf',
  productPageUrl: 'https://www.espressif.com/en/products/modules/esp32-s3-mini-1',
};

// ── ADXL355 Accelerometer Class ───────────────────────────────────────────

const adxl355 = {
  id: 'device-adxl355',
  displayName: 'ADXL355',
  category: 'sensor',
  subCategory: 'sensor-acceleration',
  description:
    'Analog Devices ADXL355 low-noise, low-drift, 3-axis MEMS accelerometer with digital output',

  symbolRef: 'SYM:ADXL355',
  footprintRef: 'FOOT:ADXL355_LGA-14',
  model3dRef: '__missing__',

  manufacturer: 'Analog Devices',
  mpn: 'ADXL355BEZ',
  lcsc: 'C23456789',
  supplierIds: [
    {
      supplier: 'mouser',
      partId: '584-ADXL355BEZ',
      url: 'https://www.mouser.com/ProductDetail/584-ADXL355BEZ',
    },
    {
      supplier: 'digikey',
      partId: '505-ADXL355BEZ-ND',
      url: 'https://www.digikey.com/en/products/detail/505-ADXL355BEZ-ND',
    },
  ],

  package: 'LGA-14_6x6mm_P0.65mm',
  standardPackage: 'LGA-14',

  pinMapping: [
    { pin: '1', name: 'VDD', type: 'power', description: 'Power supply, 2.25V to 3.6V' },
    { pin: '2', name: 'VIO', type: 'power', description: 'I/O supply, 1.8V to 3.6V' },
    { pin: '3', name: 'GND', type: 'ground', description: 'Ground' },
    { pin: '4', name: 'CS', type: 'input', description: 'SPI chip select (active low)' },
    { pin: '5', name: 'SCLK', type: 'input', description: 'SPI serial clock' },
    { pin: '6', name: 'MOSI', type: 'input', description: 'SPI master-out-slave-in' },
    { pin: '7', name: 'MISO', type: 'output', description: 'SPI master-in-slave-out' },
    { pin: '8', name: 'DRDY', type: 'output', description: 'Data ready interrupt output' },
    { pin: '9', name: 'INT1', type: 'output', description: 'Interrupt 1 output' },
    { pin: '10', name: 'INT2', type: 'output', description: 'Interrupt 2 output' },
    {
      pin: '11',
      name: 'FILT',
      type: 'pass-through',
      description: 'External filter capacitor connection',
    },
    { pin: '12', name: 'NC', type: 'no-connect', description: 'No connect — leave floating' },
    { pin: '13', name: 'NC', type: 'no-connect', description: 'No connect — leave floating' },
    { pin: '14', name: 'GND', type: 'ground', description: 'Ground (exposed pad)' },
  ],

  electricalParams: [
    { name: 'Supply Voltage', value: '2.5', unit: 'V', min: '2.25', max: '3.6' },
    { name: 'Current Consumption', value: '200', unit: 'µA', max: '300' },
    { name: 'Measurement Range', value: '2.048', unit: 'g' },
    { name: 'Noise Density', value: '25', unit: 'µg/√Hz' },
    { name: 'SPI Clock', value: '10', unit: 'MHz' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    moq: 1,
    leadTimeWeeks: 6,
    notes: 'Available from ADI distribution',
  },

  datasheetUrl:
    'https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL354_355.pdf',
  productPageUrl: 'https://www.analog.com/en/products/adxl355.html',
};

// ── BME280 Sensor Class ───────────────────────────────────────────────────

const bme280 = {
  id: 'device-bme280',
  displayName: 'BME280',
  category: 'sensor',
  subCategory: 'sensor-environmental',
  description:
    'Bosch BME280 combined temperature, humidity, and pressure sensor with I2C/SPI interface',

  symbolRef: 'SYM:BME280',
  footprintRef: 'FOOT:BME280_LGA-8',
  model3dRef: '__missing__',

  manufacturer: 'Bosch Sensortec',
  mpn: 'BME280',
  lcsc: 'C99887766',
  supplierIds: [
    { supplier: 'mouser', partId: '262-BME280' },
    { supplier: 'digikey', partId: '828-1059-1-ND' },
  ],

  package: 'LGA-8_2.5x2.5mm_P0.65mm',
  standardPackage: 'LGA-8',

  pinMapping: [
    { pin: '1', name: 'VDDIO', type: 'power', description: 'Digital I/O supply (1.2V to 3.6V)' },
    { pin: '2', name: 'VDD', type: 'power', description: 'Core supply (1.71V to 3.6V)' },
    { pin: '3', name: 'GND', type: 'ground', description: 'Ground' },
    { pin: '4', name: 'GND', type: 'ground', description: 'Ground' },
    { pin: '5', name: 'SCL', type: 'input', description: 'I2C clock / SPI serial clock' },
    { pin: '6', name: 'SDA', type: 'bidirectional', description: 'I2C data / SPI MOSI' },
    {
      pin: '7',
      name: 'CSB',
      type: 'input',
      description: 'SPI chip select (active low) / I2C address LSB',
    },
    {
      pin: '8',
      name: 'SDI',
      type: 'input',
      description: 'SPI MISO (3-wire) / I2C address LSB (alternative)',
    },
  ],

  electricalParams: [
    { name: 'Supply Voltage', value: '1.8', unit: 'V', min: '1.71', max: '3.6' },
    { name: 'Current Consumption', value: '2.0', unit: 'µA', min: '1.0', max: '3.6' },
    { name: 'Temperature Range', value: '-40 to +85', unit: '°C' },
    { name: 'Humidity Accuracy', value: '3', unit: '%RH' },
    { name: 'Pressure Accuracy', value: '1', unit: 'hPa' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    moq: 1,
    leadTimeWeeks: 6,
    notes: 'Standard availability, multiple distributors',
  },

  datasheetUrl:
    'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf',
  productPageUrl:
    'https://www.bosch-sensortec.com/products/environmental-sensors/humidity-sensors-bme280/',
};

// ── 5V AC/DC Module Class ─────────────────────────────────────────────────

const acdcModule5V = {
  id: 'device-acdc-module-5v',
  displayName: 'HLK-PM01 AC-DC 5V Module',
  category: 'power',
  subCategory: 'power-acdc',
  description: 'Hi-Link HLK-PM01 5V/600mA AC-DC step-down power module, non-isolated',

  symbolRef: 'SYM:HLK-PM01',
  footprintRef: 'FOOT:HLK-PM01',
  model3dRef: '__missing__',

  manufacturer: 'Hi-Link',
  mpn: 'HLK-PM01',

  package: 'HLK-PM01_34x20mm',
  standardPackage: 'SIP-4',

  pinMapping: [
    { pin: '1', name: 'AC_L', type: 'power', description: 'AC line input (100-240VAC)' },
    { pin: '2', name: 'AC_N', type: 'power', description: 'AC neutral input' },
    { pin: '3', name: 'VOUT', type: 'power', description: '5V DC output (±0.2V)' },
    { pin: '4', name: 'GND', type: 'ground', description: 'Output ground' },
  ],

  electricalParams: [
    { name: 'Input Voltage', value: '100-240', unit: 'VAC', min: '85', max: '265' },
    { name: 'Output Voltage', value: '5', unit: 'VDC', min: '4.8', max: '5.2' },
    { name: 'Output Current', value: '600', unit: 'mA', max: '600' },
    { name: 'Output Power', value: '3', unit: 'W' },
    { name: 'Ripple', value: '50', unit: 'mV' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    moq: 1,
    leadTimeWeeks: 3,
    notes: 'Standard through-hole module, widely available',
  },

  datasheetUrl: 'https://www.hlktech.net/product_detail.php?ProId=54',
};

// ── 3.3V Regulator Class ──────────────────────────────────────────────────

const ldo33 = {
  id: 'device-xc6206p332mr',
  displayName: 'XC6206P332MR 3.3V LDO',
  category: 'power',
  subCategory: 'power-ldo',
  description: 'Torex XC6206P332MR 3.3V fixed-output low-dropout linear regulator, 500mA max',

  symbolRef: 'SYM:XC6206P332MR',
  footprintRef: 'FOOT:SOT-23-3',
  model3dRef: '__missing__',

  manufacturer: 'Torex Semiconductor',
  mpn: 'XC6206P332MR',
  lcsc: 'C11223344',
  supplierIds: [
    { supplier: 'mouser', partId: '865-XC6206P332MR' },
    { supplier: 'digikey', partId: 'XC6206P332MR-ND' },
  ],

  package: 'SOT-23-3',
  standardPackage: 'SOT-23-3',

  pinMapping: [
    { pin: '1', name: 'VIN', type: 'power', description: 'Input voltage (up to 6V)' },
    { pin: '2', name: 'VOUT', type: 'power', description: '3.3V regulated output' },
    { pin: '3', name: 'GND', type: 'ground', description: 'Ground' },
  ],

  electricalParams: [
    { name: 'Input Voltage', value: '5.0', unit: 'V', max: '6.0' },
    { name: 'Output Voltage', value: '3.3', unit: 'V', min: '3.267', max: '3.333' },
    { name: 'Output Current', value: '500', unit: 'mA' },
    { name: 'Dropout Voltage', value: '200', unit: 'mV', max: '400' },
    { name: 'Quiescent Current', value: '2.0', unit: 'µA' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    moq: 1,
    leadTimeWeeks: 4,
    notes: 'Standard SOT-23-3, multiple second-source options available',
  },

  datasheetUrl: 'https://www.torexsemi.com/file/xc6206/XC6206.pdf',
  productPageUrl: 'https://www.torexsemi.com/products/XC6206',
};

// ── USB-C Connector ───────────────────────────────────────────────────────

const usbCConnector = {
  id: 'device-usb-c-16p',
  displayName: 'USB-C 16-Pin Connector',
  category: 'connector',
  subCategory: 'connector-usb-c',
  description: 'USB Type-C 16-pin receptacle with dual-row SMT pads, 8.34x2.6mm',

  symbolRef: 'SYM:USB-C-16P',
  footprintRef: 'FOOT:USB-C-16P_8.34x2.6mm',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'USB-C-16P',
  lcsc: 'C334455',

  package: 'USB-C-16P_8.34x2.6mm',
  standardPackage: 'USB-C-16P',

  pinMapping: [
    { pin: '1', name: 'A1', type: 'pass-through', description: 'GND' },
    { pin: '2', name: 'A2', type: 'pass-through', description: 'SBU1' },
    { pin: '3', name: 'A3', type: 'pass-through', description: 'USB_D+' },
    { pin: '4', name: 'A4', type: 'pass-through', description: 'USB_D-' },
    { pin: '5', name: 'A5', type: 'power', description: 'VBUS' },
    { pin: '6', name: 'A6', type: 'pass-through', description: 'CC1' },
    { pin: '7', name: 'A7', type: 'pass-through', description: 'SBU2' },
    { pin: '8', name: 'A8', type: 'pass-through', description: 'GND' },
    { pin: '9', name: 'B1', type: 'pass-through', description: 'GND' },
    { pin: '10', name: 'B2', type: 'pass-through', description: 'SBU2' },
    { pin: '11', name: 'B3', type: 'pass-through', description: 'USB_D+' },
    { pin: '12', name: 'B4', type: 'pass-through', description: 'USB_D-' },
    { pin: '13', name: 'B5', type: 'power', description: 'VBUS' },
    { pin: '14', name: 'B6', type: 'pass-through', description: 'CC2' },
    { pin: '15', name: 'B7', type: 'pass-through', description: 'SBU1' },
    { pin: '16', name: 'B8', type: 'pass-through', description: 'GND' },
  ],

  electricalParams: [
    { name: 'Current Rating', value: '5', unit: 'A' },
    { name: 'Voltage Rating', value: '20', unit: 'V' },
    { name: 'Durability', value: '10000', unit: 'cycles' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    moq: 1,
    leadTimeWeeks: 3,
    notes: 'Standard USB-C connector, widely available',
  },

  datasheetUrl: 'https://www.usb.org/sites/default/files/documents/usb-type-c-specification.pdf',
};

// ── Passive parts ─────────────────────────────────────────────────────────

const resistor10k0805 = {
  id: 'device-res-10k-0805',
  displayName: '10kΩ Resistor 0805',
  category: 'passive',
  subCategory: 'passive-resistor',
  description: '10kΩ ±1% thick film chip resistor, 0805 package, 1/8W',

  symbolRef: 'SYM:RES-0805',
  footprintRef: 'FOOT:RES-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'RC0805FR-0710KL',
  lcsc: 'C123456',

  package: 'RES-0805',
  standardPackage: '0805',

  electricalParams: [
    { name: 'Resistance', value: '10', unit: 'kΩ', min: '9.9', max: '10.1' },
    { name: 'Tolerance', value: '1', unit: '%' },
    { name: 'Power Rating', value: '0.125', unit: 'W' },
    { name: 'Voltage Rating', value: '150', unit: 'V' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Generic 0805 resistor, unlimited availability',
  },

  datasheetUrl:
    'https://www.yageo.com/upload/media/product/products/datasheet/rchip/PYu-RC_Group_51_RoHS_L_8.pdf',
};

const resistor1k0805 = {
  id: 'device-res-1k-0805',
  displayName: '1kΩ Resistor 0805',
  category: 'passive',
  subCategory: 'passive-resistor',
  description: '1kΩ ±1% thick film chip resistor, 0805 package, 1/8W',

  symbolRef: 'SYM:RES-0805',
  footprintRef: 'FOOT:RES-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'RC0805FR-071KL',
  lcsc: 'C123457',

  package: 'RES-0805',
  standardPackage: '0805',

  electricalParams: [
    { name: 'Resistance', value: '1', unit: 'kΩ', min: '0.99', max: '1.01' },
    { name: 'Tolerance', value: '1', unit: '%' },
    { name: 'Power Rating', value: '0.125', unit: 'W' },
    { name: 'Voltage Rating', value: '150', unit: 'V' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Generic 0805 resistor, unlimited availability',
  },

  datasheetUrl:
    'https://www.yageo.com/upload/media/product/products/datasheet/rchip/PYu-RC_Group_51_RoHS_L_8.pdf',
};

const resistor4k7_0805 = {
  id: 'device-res-4k7-0805',
  displayName: '4.7kΩ Resistor 0805',
  category: 'passive',
  subCategory: 'passive-resistor',
  description: '4.7kΩ ±1% thick film chip resistor, 0805 package, 1/8W',

  symbolRef: 'SYM:RES-0805',
  footprintRef: 'FOOT:RES-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'RC0805FR-074K7L',
  lcsc: 'C123458',

  package: 'RES-0805',
  standardPackage: '0805',

  electricalParams: [
    { name: 'Resistance', value: '4.7', unit: 'kΩ', min: '4.653', max: '4.747' },
    { name: 'Tolerance', value: '1', unit: '%' },
    { name: 'Power Rating', value: '0.125', unit: 'W' },
    { name: 'Voltage Rating', value: '150', unit: 'V' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Generic 0805 resistor, unlimited availability',
  },
};

const cap10uf0805 = {
  id: 'device-cap-10uf-0805',
  displayName: '10µF Ceramic Capacitor 0805',
  category: 'passive',
  subCategory: 'passive-capacitor',
  description: '10µF ±10% X5R ceramic chip capacitor, 0805 package, 16V',

  symbolRef: 'SYM:CAP-0805',
  footprintRef: 'FOOT:CAP-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'CL21A106KOQNNNE',
  lcsc: 'C223344',

  package: 'CAP-0805',
  standardPackage: '0805',

  electricalParams: [
    { name: 'Capacitance', value: '10', unit: 'µF', min: '9', max: '11' },
    { name: 'Tolerance', value: '10', unit: '%' },
    { name: 'Voltage Rating', value: '16', unit: 'V' },
    { name: 'Dielectric', value: 'X5R' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Generic 0805 MLCC, unlimited availability',
  },
};

const cap100nf0805 = {
  id: 'device-cap-100nf-0805',
  displayName: '100nF Ceramic Capacitor 0805',
  category: 'passive',
  subCategory: 'passive-capacitor',
  description: '100nF ±10% X7R ceramic chip capacitor, 0805 package, 50V',

  symbolRef: 'SYM:CAP-0805',
  footprintRef: 'FOOT:CAP-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'CC0805KRX7R9BB104',
  lcsc: 'C223345',

  package: 'CAP-0805',
  standardPackage: '0805',

  electricalParams: [
    { name: 'Capacitance', value: '0.1', unit: 'µF', min: '0.09', max: '0.11' },
    { name: 'Tolerance', value: '10', unit: '%' },
    { name: 'Voltage Rating', value: '50', unit: 'V' },
    { name: 'Dielectric', value: 'X7R' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Generic 0805 MLCC, unlimited availability',
  },
};

const ledRed0805 = {
  id: 'device-led-red-0805',
  displayName: 'Red LED 0805',
  category: 'passive',
  subCategory: 'passive-led',
  description: 'Red SMD LED, 0805 package, 620nm, 20mA',

  symbolRef: 'SYM:LED-0805',
  footprintRef: 'FOOT:LED-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'LTST-C190CKT',
  lcsc: 'C11223344',

  package: 'LED-0805',
  standardPackage: '0805',

  pinMapping: [
    { pin: '1', name: 'A', type: 'power', description: 'Anode' },
    { pin: '2', name: 'K', type: 'ground', description: 'Cathode' },
  ],

  electricalParams: [
    { name: 'Forward Voltage', value: '2.0', unit: 'V', min: '1.8', max: '2.4' },
    { name: 'Forward Current', value: '20', unit: 'mA' },
    { name: 'Wavelength', value: '620', unit: 'nm' },
    { name: 'Luminous Intensity', value: '80', unit: 'mcd' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Standard SMD LED, widely available',
  },
};

const ledGreen0805 = {
  id: 'device-led-green-0805',
  displayName: 'Green LED 0805',
  category: 'passive',
  subCategory: 'passive-led',
  description: 'Green SMD LED, 0805 package, 525nm, 20mA',

  symbolRef: 'SYM:LED-0805',
  footprintRef: 'FOOT:LED-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'LTST-C190GKT',
  lcsc: 'C11223344',

  package: 'LED-0805',
  standardPackage: '0805',

  pinMapping: [
    { pin: '1', name: 'A', type: 'power', description: 'Anode' },
    { pin: '2', name: 'K', type: 'ground', description: 'Cathode' },
  ],

  electricalParams: [
    { name: 'Forward Voltage', value: '2.0', unit: 'V', min: '1.8', max: '2.4' },
    { name: 'Forward Current', value: '20', unit: 'mA' },
    { name: 'Wavelength', value: '525', unit: 'nm' },
    { name: 'Luminous Intensity', value: '80', unit: 'mcd' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Standard SMD LED, widely available',
  },
};

const ledBlue0805 = {
  id: 'device-led-blue-0805',
  displayName: 'Blue LED 0805',
  category: 'passive',
  subCategory: 'passive-led',
  description: 'Blue SMD LED, 0805 package, 470nm, 20mA',

  symbolRef: 'SYM:LED-0805',
  footprintRef: 'FOOT:LED-0805',
  model3dRef: '__missing__',

  manufacturer: 'Generic',
  mpn: 'LTST-C190TBKT',
  lcsc: 'C11223344',

  package: 'LED-0805',
  standardPackage: '0805',

  pinMapping: [
    { pin: '1', name: 'A', type: 'power', description: 'Anode' },
    { pin: '2', name: 'K', type: 'ground', description: 'Cathode' },
  ],

  electricalParams: [
    { name: 'Forward Voltage', value: '3.2', unit: 'V', min: '2.8', max: '3.6' },
    { name: 'Forward Current', value: '20', unit: 'mA' },
    { name: 'Wavelength', value: '470', unit: 'nm' },
    { name: 'Luminous Intensity', value: '80', unit: 'mcd' },
  ],

  lifecycleStatus: 'active',
  assemblyHint: {
    status: 'in-production',
    notes: 'Standard SMD LED, widely available',
  },
};

// ── Exported starter catalog ───────────────────────────────────────────────

/**
 * Pre-populated device catalog with entries covering the most common
 * MCU, sensor, power, connector, and passive classes used in typical
 * EasyEDA Pro designs.
 *
 * To use: import `STARTER_DEVICE_CATALOG` and pass to `validateDeviceCatalog()`
 * before use. Individual entries can be added/removed as needed.
 *
 * @example
 * ```typescript
 * import { STARTER_DEVICE_CATALOG } from './starter.js';
 * import { validateDeviceCatalog } from './schema.js';
 *
 * const catalog = validateDeviceCatalog({
 *   $schema: DEVICE_CATALOG_SCHEMA_VERSION,
 *   devices: STARTER_DEVICE_CATALOG,
 *   metadata: { version: '1.0.0', name: 'My Catalog' },
 * });
 * ```
 */
export const STARTER_DEVICE_CATALOG = [
  esp32S3Mini1N8,
  adxl355,
  bme280,
  acdcModule5V,
  ldo33,
  usbCConnector,
  resistor10k0805,
  resistor1k0805,
  resistor4k7_0805,
  cap10uf0805,
  cap100nf0805,
  ledRed0805,
  ledGreen0805,
  ledBlue0805,
];
