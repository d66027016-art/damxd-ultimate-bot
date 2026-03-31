const axios = require('axios');

const ENDER_KEY = 'ender_11ff50fa71150deefdbffe5d6f045cbc';
const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

const domains = ['https://api.ender.black', 'https://ender.black'];
const prefixes = ['/v1', '', '/api', '/api/v1'];
const basePaths = ['/tools/ccgen', '/ccgen', '/tools/bin', '/bin', '/me', '/user/me'];
const methods = ['GET', 'POST'];

async function scan() {
    for (const domain of domains) {
        for (const prefix of prefixes) {
            for (const basePath of basePaths) {
                for (const method of methods) {
                    const url = `${domain}${prefix}${basePath}`;
                    process.stdout.write(`Testing ${method} ${url} ... `);
                    try {
                        const payload = method === 'POST' ? { bin: '374355' } : {};
                        const res = await axios({ method, url, data: payload, headers });
                        console.log(`SUCCESS! (${res.status})`);
                        // console.log(JSON.stringify(res.data).substring(0, 100));
                        if (basePath.includes('me') || basePath.includes('bin') || basePath.includes('ccgen')) {
                            console.log(`FOUND POSSIBLE ENDPOINT: ${method} ${url}`);
                        }
                    } catch (e) {
                        const status = e.response ? e.response.status : e.message;
                        console.log(`FAILED (${status})`);
                    }
                }
            }
        }
    }
}

scan();
