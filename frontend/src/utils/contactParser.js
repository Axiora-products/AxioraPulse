import * as XLSX from 'xlsx';

// Standard regex patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/; // Supports optional leading + and 7 to 15 digits

/**
 * Validates email format
 */
export function validateEmail(email) {
  return EMAIL_REGEX.test(email);
}

/**
 * Validates phone format (strips symbols first)
 */
export function validatePhone(phone) {
  const clean = phone.replace(/[\s\-\(\)]/g, '');
  return PHONE_REGEX.test(clean);
}

/**
 * Extracts potential email addresses from raw text using a global regex
 */
export function extractEmailsFromText(text) {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return (text.match(regex) || []).map(e => e.trim().toLowerCase());
}

/**
 * Extracts potential phone numbers from raw text
 */
export function extractPhonesFromText(text) {
  // Replace spaces, hyphens, parentheses to let us easily match long strings of digits
  const cleanedText = text.replace(/[\(\)\-\s]/g, ' ');
  const regex = /\+?[0-9]{7,15}/g;
  return (cleanedText.match(regex) || []).map(n => n.trim());
}

/**
 * Parses a CSV or Excel file and extracts contacts of a given type
 */
export function parseFile(file, type = 'email') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        let textContent = '';
        
        if (file.name.endsWith('.csv')) {
          // Parse CSV
          const decoder = new TextDecoder('utf-8');
          textContent = decoder.decode(e.target.result);
        } else {
          // Parse Excel using xlsx library
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Flatten all rows and columns
          const cells = [];
          json.forEach(row => {
            row.forEach(cell => {
              if (cell !== undefined && cell !== null) {
                cells.push(String(cell));
              }
            });
          });
          textContent = cells.join(' ');
        }
        
        // Extract based on type
        const extracted = type === 'email' 
          ? extractEmailsFromText(textContent)
          : extractPhonesFromText(textContent);
          
        resolve(processRawContacts(extracted, type));
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Processes a list of raw string contacts (deduplicating and validating)
 */
export function processRawContacts(rawList, type = 'email') {
  const uniques = Array.from(new Set(rawList.map(item => item.trim())));
  const valid = [];
  const invalid = [];
  
  uniques.forEach(item => {
    if (!item) return;
    
    if (type === 'email') {
      if (validateEmail(item)) {
        valid.push(item);
      } else {
        invalid.push({ value: item, reason: 'Invalid email format' });
      }
    } else {
      const cleanNum = item.replace(/[\s\-\(\)]/g, '');
      if (validatePhone(cleanNum)) {
        valid.push(cleanNum);
      } else {
        invalid.push({ value: item, reason: 'Invalid mobile number format' });
      }
    }
  });
  
  return {
    total: uniques.length,
    valid,
    invalid
  };
}
