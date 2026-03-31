const axios = require('axios');

const BASE_URL = 'https://api.ender.black/v1';
const ENDER_KEY = 'ender_11ff50fa71150deefdbffe5d6f045cbc';
const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

async function test() {
    try {
        const bin = '374355';
        const endpoints = ['/tools/bin-lookup', '/tools/cc-generator'];
        
        for (const endpoint of endpoints) {
            console.log(`Testing POST ${BASE_URL}${endpoint} ...`);
            const res = await axios.post(`${BASE_URL}${endpoint}`, { bins: [bin] }, { headers });
            console.log(`SUCCESS! Status: ${res.status}`);
            console.log(`Data: ${JSON.stringify(res.data, null, 2)}`);
            console.log('---');
        }
    } catch (e) {
        console.log(`FAILED: ${e.message}`);
        if (e.response) {
            console.log(`Status: ${e.response.status}`);
            console.log(`Data: ${JSON.stringify(e.response.data)}`);
        }
    }
}

test();
