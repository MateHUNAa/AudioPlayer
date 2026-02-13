const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  'node_modules',
  'react-native-track-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'doublesymmetry',
  'trackplayer',
  'module',
  'MusicModule.kt',
);

let content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');
const result = [];
let scopeLaunchActive = false;
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  if (line.includes('= scope.launch {')) {
    line = line.replace('= scope.launch {', '{ scope.launch {');
    scopeLaunchActive = true;
    braceDepth = 0;
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    result.push(line);
    continue;
  }

  if (
    line.trimEnd() === '        scope.launch {' &&
    i > 0 &&
    lines[i - 1].trimEnd().endsWith('=')
  ) {
    result[result.length - 1] = result[result.length - 1].replace(/=\s*$/, '{');
    scopeLaunchActive = true;
    braceDepth = 1;
    result.push(line);
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    continue;
  }

  if (scopeLaunchActive) {
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }

    if (braceDepth === 1) {
      scopeLaunchActive = false;
      line = line + ' }';
    }
  }

  result.push(line);
}

fs.writeFileSync(filePath, result.join('\n'), 'utf-8');
console.log('MusicModule.kt patched successfully.');
