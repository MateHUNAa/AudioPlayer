const fs = require('fs');

const args = process.argv.slice(2);
let inputFile = null;
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-out' && i + 1 < args.length) {
    outputFile = args[i + 1];
    i++;
  } else if (!args[i].startsWith('-') && fs.existsSync(args[i])) {
    inputFile = args[i];
  }
}

if (inputFile && outputFile) {
  fs.copyFileSync(inputFile, outputFile);
}
