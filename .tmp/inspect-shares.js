const fs = require('fs');

const photos = fs.readFileSync('.tmp/google-photos.html', 'utf8');
const drive = fs.readFileSync('.tmp/google-drive.html', 'utf8');

const photoUrls = [...new Set([...photos.matchAll(/https:\/\/lh3\.googleusercontent\.com\/[^"\\]+/g)].map((m) => m[0]))];
console.log('PHOTO URLS');
console.log(photoUrls.slice(0, 100).join('\n'));

const fileNames = [...new Set([...drive.matchAll(/[^"\\<>]{1,140}\.(?:jpg|jpeg|png|webp|mp4|mov|pdf|docx|xlsx)/gi)].map((m) => m[0]))]
  .filter((name) => !name.includes('gstatic.com'));

console.log('\nDRIVE FILE CONTEXTS');
for (const name of fileNames.slice(0, 30)) {
  const index = drive.indexOf(name);
  const before = drive.slice(Math.max(0, index - 260), index);
  const after = drive.slice(index + name.length, index + name.length + 260);
  console.log(`\n--- ${name} ---\n${before}[FILE]${after}`);
}
