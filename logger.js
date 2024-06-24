function logConsole(msg) {
    const date = new Date();
    console.log(`[${date.toLocaleString()}]: ${msg}`);
}

module.exports = logConsole;