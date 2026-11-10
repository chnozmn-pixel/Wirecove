const fs = require('node:fs');
const path = require('node:path');

function readRules(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value) ? value.filter(item => item && typeof item.path === 'string' && typeof item.name === 'string') : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeRules(file, rules) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(rules, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

function addRule(file, app) {
  if (!app || typeof app.path !== 'string' || typeof app.name !== 'string')
    throw new Error('Invalid application');
  const rules = readRules(file);
  const existing = rules.find(item => item.path === app.path);
  if (existing) {
    if (typeof app.signingIdentifier === 'string') existing.signingIdentifier = app.signingIdentifier;
    writeRules(file, rules);
  } else {
    const item = { path: app.path, name: app.name };
    if (typeof app.signingIdentifier === 'string') item.signingIdentifier = app.signingIdentifier;
    rules.push(item);
    rules.sort((a,b) => a.name.localeCompare(b.name));
    writeRules(file, rules);
  }
  return rules;
}

function removeRule(file, appPath) {
  if (typeof appPath !== 'string') throw new Error('Invalid application');
  const rules = readRules(file).filter(item => item.path !== appPath);
  writeRules(file, rules);
  return rules;
}

module.exports = { readRules, addRule, removeRule };
