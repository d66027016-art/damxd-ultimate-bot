const axios = require('axios');

const BASE_URL = 'https://api.ender.black/v1';
const ENDER_KEY = 'ender_11ff50fa71150deefdbffe5d6f045cbc';
const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

const cards = ['5111111111111111|11|2026|123'];

async function testVbv() {
    const variations = [
        { gate: 'vbv' },
        { gateId: 'vbv' },
        { gate: '/vbv' },
        { gateId: '/vbv' },
        { type: 'vbv' }
    ];

    for (const v of variations) {
        console.log(`Testing /checkers/vbv with payload: ${JSON.stringify(v)}...`);
        try {
            const res = await axios.post(`${BASE_URL}/checkers/vbv`, { ...v, cards }, { headers });
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

testVbv();
