import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
const owner = 'rodionabzalilov95596-cloud';
const repo = 'fitpilot-bot';
const branch = 'main';

const token = process.env.GITHUB_TOKEN?.trim();
if (!token) {
  console.error('Нужен GITHUB_TOKEN в .env (Personal Access Token с правом repo)');
  process.exit(1);
}

const skipDirs = new Set(['node_modules', 'data', 'dist', 'tools', '.git']);
const skipFiles = new Set(['.env', '.env.txt', 'fitpilot-bot-upload.zip']);

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (skipFiles.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (skipDirs.has(name)) continue;
      out.push(...walk(full, rel));
    } else {
      out.push({ rel: rel.replace(/\\/g, '/'), full });
    }
  }
  return out;
}

async function gh(pathname, options = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${pathname} HTTP ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function getRefSha() {
  try {
    const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return ref.object.sha;
  } catch {
    return null;
  }
}

async function deleteOldRootFiles() {
  const contents = await gh(`/repos/${owner}/${repo}/contents?ref=${branch}`);
  const stale = ['app.js', 'index.html', 'styles.css'];
  for (const item of contents) {
    if (!stale.includes(item.name)) continue;
    await gh(`/repos/${owner}/${repo}/contents/${item.path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `remove stale ${item.name}`,
        sha: item.sha,
        branch
      })
    });
    console.log('Removed stale', item.name);
  }
}

async function main() {
  const files = walk(root);
  console.log(`Uploading ${files.length} files...`);

  let sha = await getRefSha();
  if (sha) await deleteOldRootFiles();

  for (const file of files) {
    const content = fs.readFileSync(file.full).toString('base64');
    let existingSha;
    try {
      const existing = await gh(`/repos/${owner}/${repo}/contents/${file.rel}?ref=${branch}`);
      existingSha = existing.sha;
    } catch {
      existingSha = undefined;
    }

    await gh(`/repos/${owner}/${repo}/contents/${file.rel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: existingSha ? `update ${file.rel}` : `add ${file.rel}`,
        content,
        branch,
        ...(existingSha ? { sha: existingSha } : {})
      })
    });
    console.log(existingSha ? 'Updated' : 'Added', file.rel);
  }

  console.log('\nDone: https://github.com/' + owner + '/' + repo);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
