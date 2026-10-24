#!/usr/bin/env node
const path = require('path');
const { NwjsCliLauncher } = require(path.resolve(__dirname, '..', 'dist', 'index.js'));

(async function main() {
  const args = NwjsCliLauncher.parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(NwjsCliLauncher.getHelpText());
    process.exit(0);
  }
  const exitCode = await NwjsCliLauncher.launch(args);
  process.exit(exitCode);
})();
