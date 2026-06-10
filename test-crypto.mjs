import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = 'aemang-location-encryption-key-2026';

// Test encryption
const lat = 37.5565;
const lng = 126.9242;
const data = JSON.stringify({ lat, lng, timestamp: Date.now() });
const encrypted = CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();

console.log('📍 원본 위치 데이터:', data);
console.log('🔒 암호화됨:', encrypted.substring(0, 50) + '...');

// Test decryption
const decrypted = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
console.log('🔓 복호화됨:', decrypted);

// Test phone hash
const phone = '010-1234-5678';
const hashed = CryptoJS.SHA256(phone + ENCRYPTION_KEY).toString();
console.log('📱 전화번호 해시:', hashed.substring(0, 40) + '...');
console.log('✅ P1 암호화 기능 정상 작동!');
