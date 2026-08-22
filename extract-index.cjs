const fs = require('fs');
const code = fs.readFileSync('C:\\Users\\cheapters\\Desktop\\bot-site\\CypherX\\CypherX-main\\index.js', 'utf8');

const match = code.match(/function [a-zA-Z0-9_]+\([a-zA-Z0-9_]+\)\{var [a-zA-Z0-9_]+=".*?";/);
if (!match) {
    console.log("Could not find decrypter in index.js");
    process.exit(1);
}

const headIdx = code.indexOf(match[0]);
let decrypterFunc = code.substring(0, headIdx + match[0].length);
decrypterFunc = code.substring(0, 16000); // just grab first 16kb

// We want to find the first call to the decrypter
const decrypterNameMatch = code.match(/function ([a-zA-Z0-9_]+)\([a-zA-Z0-9_]+\)\{var [a-zA-Z0-9_]+=".*?"/);
const funcName = decrypterNameMatch[1];
console.log("Decrypter name:", funcName);

let output = '';
for(let i = 0; i < 500; i++) {
    try {
        const val = eval(decrypterFunc + '\n' + funcName + '(' + i + ')');
        if(val) output += i + ': ' + val + '\n';
    } catch(e) {}
}
fs.writeFileSync('C:\\Users\\cheapters\\Desktop\\bot-site\\index_strings.txt', output);
console.log("Wrote strings");
