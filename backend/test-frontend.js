const fetch = require('node-fetch');
async function test() {
  const res = await fetch('http://localhost:3001/api/deepseek/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'nvidia',
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{role: 'user', content: 'hello'}],
      stream: true
    })
  });
  console.log(res.status);
  const reader = res.body;
  reader.on('data', c => console.log(c.toString()));
}
test();
