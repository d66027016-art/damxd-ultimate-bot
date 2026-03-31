const axios = require('axios');

const BASE_URL = 'https://api.ender.black/v1';
const ENDER_KEY = 'ender_11ff50fa71150deefdbffe5d6f045cbc';
const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

async function testAdvanced() {
    const tests = [
        { name: 'VBV Checker', url: '/checkers/vbv', payload: { cards: ['5111111111111111|11|2026|123'] } },
        { name: 'Charge Hitter', url: '/checkers/charge', payload: { cards: ['5111111111111111|11|2026|123'] } },
        { name: 'Captcha Solver', url: '/solvers/solve', payload: { sitekey: 'test', url: 'https://google.com', type: 'hcaptcha' } },
        { name: 'CC Cleaner', url: '/tools/cc-cleaner', payload: { input: '5111111111111111|11|2026|123' } }
    ];

    for (const test of tests) {
        console.log(`Testing: ${test.name} (${test.url})...`);
        try {
            const res = await axios.post(`${BASE_URL}${test.url}`, test.payload, { headers });
            console.log(`SUCCESS! Status: ${res.status}`);
            console.log(`Data: ${JSON.stringify(res.data)}`);
        } catch (e) {
            console.log(`FAILED: ${e.message}`);
            if (e.response) {
                console.log(`Status: ${e.response.status}`);
                console.log(`Data: ${JSON.stringify(e.response.data)}`);
            }
        }
        console.log('---');
    }
}

testAdvanced();
