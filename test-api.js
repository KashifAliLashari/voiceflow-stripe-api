const testAPI = async () => {
  try {
    const response = await fetch('https://voiceflow-stripe-api.onrender.com/api/check-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'becreativekashif@gmail.com'
      })
    });

    const data = await response.json();
    console.log('✅ TEST 2 - Subscription Check:');
    console.log(JSON.stringify(data, null, 2));
    
    // Validation
    if (data.hasSubscription && data.subscriptionTier === 'premium') {
      console.log('✅ PASS: API returns correct subscription data');
    } else {
      console.log('❌ FAIL: Unexpected response');
    }
  } catch (error) {
    console.error('❌ TEST 2 FAILED:', error.message);
  }
};

testAPI();