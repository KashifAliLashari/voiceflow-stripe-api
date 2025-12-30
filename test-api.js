const testAPI = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/check-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com'
      })
    });

    const data = await response.json();
    console.log('✅ API Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

testAPI();