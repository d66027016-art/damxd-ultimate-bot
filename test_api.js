const axios = require('axios');

const ENDER_KEY = 'ender_11ff50fa71150deefdbffe5d6f045cbc';
const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

const baseUrls = [
    'https://api.ender.black/v1',
    'https://api.ender.black',
    'https://api.ender.black/api',
    'https://api.ender.black/api/v1',
    'https://ender.black/v1',
    'https://api.ender.black/v2',
    'https://api.ender.black/v3',
    'https://api.ender.black/v5'
];

const endpoint = '/balance';

async function test() {
    for (const baseUrl of baseUrls) {
        try {
            const url = `${baseUrl}${endpoint}`;
            process.stdout.write(`Testing: ${url} ... `);
            const res = await axios.get(url, { headers });
            console.log('SUCCESS!');
            console.log(JSON.stringify(res.data, null, 2));
            break;
        } catch (e) {
            console.log(`FAILED (${e.response ? e.response.status : e.message})`);
        }
    }
}

test();
