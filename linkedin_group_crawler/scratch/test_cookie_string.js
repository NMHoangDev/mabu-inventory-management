const tough = require('tough-cookie');

const cookies = [
{"key":"__zi","value":"3000.SSZzejyD3jSkdkMgrnS5mcs6xlpLGnkCOvwjeCT9LS1WdEVgnqvNnMJLu-_61r70QzVWx3SuCG.1","domain":".zalo.me","path":"/","httpOnly":false,"secure":true,"sameSite":"no_restriction","expires":1816193803.18922},
{"key":"zpdid","value":"4X7sarFze3GN6PYRLV_DDXKQdP1M_SCv","domain":".id.zalo.me","path":"/","httpOnly":true,"secure":true,"sameSite":"lax","expires":1816193232.243605},
{"key":"_zlang","value":"vn","domain":".zalo.me","path":"/","httpOnly":false,"secure":true,"sameSite":"none","expires":1781720201.560222},
{"key":"zlogin_session","value":"kW4JGLyjCnIxFnDDLXTbH-Tj2KPH4sv4ucmMLWjHO5ofBGLV1r5fMgaj3Lm7KMrP8dq","domain":".id.zalo.me","path":"/","httpOnly":true,"secure":true,"sameSite":"lax","expires":1781636832.243648},
{"key":"zpsid","value":"VsZY.327635537.16.MdGJi9YfnUF9-qBmbAd5u-tQjz2gdlFGhPpsrEaGhtABfCOYcNnLqlAfnUC","domain":".zalo.me","path":"/","httpOnly":true,"secure":true,"sameSite":"no_restriction","expires":1813169238.125563},
{"key":"zpw_sek","value":"DMmi.327635537.a0.N59WhDZ-XQY9h0Ax-Vw5gAFSuCFwnAVmguospfwHuCINozVUjQVepk7En-6lmxYAfOyymadjYAiP_rCuwPI5g0","domain":".chat.zalo.me","path":"/","httpOnly":true,"secure":true,"sameSite":"lax","expires":1789409238.744587},
{"key":"zpsid","value":"eMKnVcAlVqAZUYmFLxD8DTiwH65FiqyttZvVPKggB6AlMdiuL8Oh3h05E1nGqcG-bbqlS42sUsdGQo5cD9PtLUPVEtCbecranberH2kvQ6ddJoTc19DtK4C","domain":".zaloapp.com","path":"/","httpOnly":true,"secure":true,"sameSite":"no_restriction","expires":1813169238.688732},
{"key":"__zi","value":"3000.QOBlzDCV2uGerkFzm09KrcBMvF_51XtIPjcf-C4D7jTjsQdx.1","domain":".zaloapp.com","path":"/","httpOnly":false,"secure":true,"sameSite":"no_restriction","expires":1816193238.688882}
];

const jar = new tough.CookieJar();
cookies.forEach(c => {
    // strip dot
    let d = c.domain;
    if (d && d.startsWith('.')) d = d.slice(1);
    
    let e = c.expires;
    if (typeof e === 'number') e = new Date(e * 1000).toISOString();
    
    const cookieObj = tough.Cookie.fromJSON({ ...c, key: c.key || c.name, expires: e });
    if (cookieObj) {
        cookieObj.domain = d;
        jar.setCookieSync(cookieObj, `https://${d}`);
    }
});
console.log(JSON.stringify(jar.serializeSync(), null, 2));

console.log("Cookies for wpa.chat.zalo.me:");
console.log(jar.getCookieStringSync('https://wpa.chat.zalo.me'));
