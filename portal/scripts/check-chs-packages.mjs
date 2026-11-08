import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const receipt = JSON.parse(readFileSync(join(root, 'vendor/chs-packages.json'), 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

function packageDirectory(requester, name) {
  let directory = dirname(requester.resolve(name));
  for (;;) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) return directory;
    const parent = dirname(directory);
    assert.notEqual(parent, directory, `Missing package manifest: ${name}`);
    directory = parent;
  }
}

for (const pkg of receipt.packages) {
  const vendor = join(root, 'vendor', pkg.directory);
  const installed = packageDirectory(require, pkg.name);
  assert.ok(realpathSync(installed).startsWith(root + sep), `${pkg.name} must resolve within this checkout`);
  const expected = JSON.parse(readFileSync(join(vendor, 'package.json'), 'utf8'));
  const actual = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(actual.version, pkg.version);
  for (const key of ['dependencies', 'peerDependencies', 'peerDependenciesMeta', 'exports']) {
    assert.deepEqual(actual[key], expected[key], `${pkg.name}: installed ${key} differs`);
  }
  for (const file of pkg.files) {
    assert.equal(sha256(join(vendor, file.path)), file.sha256, `${pkg.name}: vendored ${file.path} differs`);
    if (file.path.startsWith('dist/')) {
      assert.equal(sha256(join(installed, file.path)), file.sha256, `${pkg.name}: installed ${file.path} differs`);
    }
  }
  await import(pathToFileURL(require.resolve(pkg.name)).href);
}

for (const subpath of ['auth-d1/schema', 'auth-d1/plugins', 'auth-d1/plugins/mcp']) {
  await import(pathToFileURL(require.resolve(`@chester-hill-solutions/${subpath}`)).href);
}

const contexts = [require, ...['auth-d1', 'auth-react-router'].map(name =>
  createRequire(require.resolve(`@chester-hill-solutions/${name}`)))];
for (const context of contexts) {
  for (const name of ['@chester-hill-solutions/auth', '@chester-hill-solutions/app-origin']) {
    const pkg = receipt.packages.find(candidate => candidate.name === name);
    const directory = packageDirectory(context, name);
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    assert.equal(manifest.version, pkg.version, `${name}: stale consuming-context version`);
    for (const file of pkg.files.filter(file => file.path.startsWith('dist/'))) {
      assert.equal(sha256(join(directory, file.path)), file.sha256, `${name}: stale consuming-context ${file.path}`);
    }
  }
  for (const subpath of ['auth', 'auth/cookies', 'auth/origin', 'app-origin']) {
    const entry = context.resolve(`@chester-hill-solutions/${subpath}`);
    assert.ok(realpathSync(entry).startsWith(root + sep), 'CHS runtime closure escaped the checkout');
    await import(pathToFileURL(entry).href);
  }
  for (const name of ['better-auth', '@better-auth/core', '@better-auth/drizzle-adapter',
    '@better-auth/cimd', '@better-auth/mcp', '@better-auth/oauth-provider']) {
    const manifest = JSON.parse(readFileSync(join(packageDirectory(context, name), 'package.json'), 'utf8'));
    assert.equal(manifest.version, '1.7.14', `${name} must retain the existing coherent auth engine`);
  }
}
console.log('CHS vendored/installed payloads, native runtime closures and existing auth peers verified');
