const { normalizeUrl } = require('./url');
const cases = [
  ['https://github.com/basemelsayed540/HALKK', 'https://basemelsayed540.github.io/HALKK/'],
  ['github.com/Owner/Repo.git', 'https://owner.github.io/Repo/'],
  ['https://github.com/owner/owner.github.io', 'https://owner.github.io/'],
  ['https://basemelsayed540.github.io/HALKK/', 'https://basemelsayed540.github.io/HALKK/'],
  ['basemelsayed540.github.io/HALKK', 'https://basemelsayed540.github.io/HALKK'],
  ['  https://example.com  ', 'https://example.com/'],
];
let bad = 0;
for (const [i, exp] of cases) { const r = normalizeUrl(i); if (r.url !== exp) { bad++; console.log('FAIL', i, r); } }
for (const i of ['', 'abc', 'ftp://x.com', 'https://github.com/owner', 'a b.com', 'javascript:alert(1)']) { if (!normalizeUrl(i).error) { bad++; console.log('should fail', i); } }
console.log(bad ? bad + ' failed' : 'all ok'); process.exit(bad ? 1 : 0);
