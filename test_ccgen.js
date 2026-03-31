const axios = require('axios');

const BASE_URL = 'https://api.ender.black/v1';
const ENDER_KEY = 'ender_11ff50fa71150deefdbffe5d6f045cbc';
const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

async function test() {
    try {
        const url = `${BASE_URL}/tools/ccgen`;
        console.log(`Testing POST ${url} ...`);
        const res = await axios.post(url, { bin: '374355' }, { headers });
        console.log('SUCCESS!');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log(`FAILED: ${e.message}`);
        if (e.response) {
            console.log(`Status: ${e.response.status}`);
            console.log(`Data: ${JSON.stringify(e.response.data)}`);
        }
    }
}

test();
