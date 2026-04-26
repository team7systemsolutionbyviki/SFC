const _K_ = "SFC_ADMIN_SECURE_2024";
const pass1 = "VIKI1101";
const pass2 = "654321";

const _E_ = (s, k) => {
    let r = "";
    for(let i=0; i<s.length; i++) r += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return Buffer.from(r, 'binary').toString('base64');
};

console.log("VIKI1101 ENCODED:", _E_(pass1, _K_));
console.log("654321 ENCODED:", _E_(pass2, _K_));
