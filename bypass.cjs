const cp = require('child_process');
const oldSpawn = cp.spawn;
cp.spawn = function(...args) {
    if (args[0] === 'node' || args[0] === 'npm' || args[0].endsWith('node') || args[0].endsWith('npm') || args[0].endsWith('npm.cmd')) {
        let env = args[2] && args[2].env ? args[2].env : process.env;
        env = Object.assign({}, env);
        env.NODE_OPTIONS = '--require ' + require('path').resolve(__dirname, 'bypass2.cjs').replace(/\\/g, '/');
        if (!args[2]) args[2] = {};
        args[2].env = env;
    }
    return oldSpawn.apply(this, args);
};
const oldFork = cp.fork;
cp.fork = function(...args) {
    return oldFork.apply(this, args);
};
