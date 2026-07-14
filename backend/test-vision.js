require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function test() {
  const imgPath = path.join(__dirname, 'test-out.jpg');
  if (!fs.existsSync(imgPath)) {
    console.error('test-out.jpg not found. Run screencapture first.');
    return;
  }
  
  console.log('Reading image and converting to base64...');
  const imgBuffer = fs.readFileSync(imgPath);
  const base64Image = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

  console.log('Sending request to Nvidia NIM...');
  const start = Date.now();
  
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta/llama-3.2-11b-vision-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the main heading text visible in this screenshot.' },
              { type: 'image_url', image_url: { url: base64Image } }
            ]
          }
        ],
        max_tokens: 50
      })
    });
    
    console.log(`Status: ${res.status} | Time: ${Date.now() - start}ms`);
    console.log(await res.text());
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
