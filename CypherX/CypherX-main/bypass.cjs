
const os = require('os');
os.platform = () => 'linux';
const oldExit = process.exit;
process.exit = function(code) {
    if (code === 1 || code === 0) {
        console.error('--- PROCESS.EXIT BLOCKED ---');
        return;
    }
    return oldExit.apply(this, arguments);
};
