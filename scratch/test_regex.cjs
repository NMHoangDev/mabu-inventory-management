const dollar = '$';
const s = 'Foo bar, MH 25266, KT00 (18*15*2)cm+-10%';
const re = /,?\s+MH(?![A-Za-z0-9])\s+[^,\n]+$/i;
console.log('Regex source:', re.source);
console.log('Match?', s.match(re));
console.log('Replace:', s.replace(re, '___'));

const re2 = /,?\s+MH\s+[^,\n]+$/i;
console.log('Regex2:', re2.source);
console.log('Match2?', s.match(re2));
console.log('Replace2:', s.replace(re2, '___'));