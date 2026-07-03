const fs = require('fs');
const { Zalo } = require('zca-js');

async function testLogin() {
    const authRaw = fs.readFileSync('D:\\CrawlDataLinkedin\\linkedin_group_crawler\\artifacts\\zca-auth\\123456.json', 'utf8');
    const auth = JSON.parse(authRaw);
    
    console.log("Testing with IMEI:", auth.imei);
    
    const zalo = new Zalo({
        selfListen: true,
        checkUpdate: false,
        logging: true
    });
    
    try {
        let cookieData = auth.cookies;
        if (typeof cookieData === 'string') cookieData = JSON.parse(cookieData);
        
        // Print the cookie string
        zalo.cookie = zalo.parseCookies(cookieData);
        const cookieStr = await zalo.cookie.getCookieString('https://wpa.chat.zalo.me/api/login/getLoginInfo');
        console.log("Cookie Header:", cookieStr);
        
        const api = await zalo.login({
            cookie: cookieData,
            imei: auth.imei,
            userAgent: auth.userAgent
        });
        console.log("Login success!", Object.keys(api));
    } catch (e) {
        console.error("Login failed!");
        console.error(e);
        console.error(e.stack);
    }
}

testLogin();
