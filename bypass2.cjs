const os = require('os');
const oldPlatform = os.platform;
os.platform = () => 'linux'; // Try linux first

const oldLog = console.log;
console.log = function(...args) {
    oldLog.apply(console, args);
    if (args[0] && typeof args[0] === 'string' && args[0].includes('Crashing infinitely')) {
        console.error(new Error('STACK TRACE FOR CRASH MESSAGE'));
    }
};

const oldExit = process.exit;
process.exit = function(code) {
    console.error('--- PROCESS.EXIT CALLED WITH CODE ' + code + ' ---');
    console.error(new Error('EXIT STACK'));
    // Do not exit to see if we bypass it completely
};
