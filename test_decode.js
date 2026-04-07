const _K_ = "SFC_ADMIN_SECURE_2024";
const _V_C_ = "DhcPFBEXExM="; // VIKI1101
const _H_C_ = "BAsKBgwH";     // 654321

const _A_ = (e, k) => {
    let s = Buffer.from(e, 'base64').toString('binary'), r = "";
    for (let i = 0; i < s.length; i++) r += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return r;
};

console.log("VIKI PASS:", _A_(_V_C_, _K_));
console.log("HARI PASS:", _A_(_H_C_, _K_));
