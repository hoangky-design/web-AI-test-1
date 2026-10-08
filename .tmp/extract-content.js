const fs = require('fs');

const source = fs.readFileSync('.tmp/hinton-app.js', 'utf8');
const strings = new Set();
const quoted = /(["'])(.*?)(?<!\\)\1/g;

for (const match of source.matchAll(quoted)) {
  const value = match[2].replace(/\\n/g, ' ').trim();
  if (value.length < 4 || value.length > 500) continue;
  if (/[À-ỹ]/.test(value) || /Hinton|Media|Marketing|Khóa|Dịch vụ|Giới thiệu|Liên hệ|truyền thông|đào tạo/i.test(value)) {
    strings.add(value);
  }
}

process.stdout.write([...strings].join('\n'));
