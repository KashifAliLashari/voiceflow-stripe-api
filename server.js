require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Price ID mapping to subscription tiers
const TIER_MAPPING = {
  [process.env.PRICE_ID_BASIC]: 'basic',
  [process.env.PRICE_ID_PRO]: 'pro',
  [process.env.PRICE_ID_PREMIUM]: 'premium'
};

// IMPORTANT: Apply express.json() to all routes EXCEPT webhook
// Webhook needs raw body for signature verification
app.use((req, res, next) => {
  if (req.path === '/webhook/stripe') {
    next(); // Skip JSON parsing for webhook
  } else {
    express.json()(req, res, next);
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Voiceflow-Stripe API is running',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// ENDPOINT 1: Check Subscription (for Voiceflow)
// ==========================================
app.post('/api/check-subscription', async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Please provide either userId or email'
      });
    }

    // Query Supabase for subscription
    let query = supabase
      .from('subscriptions')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.eq('email', email);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      // User not found or no subscription
      return res.json({
        hasSubscription: false,
        subscriptionTier: 'free',
        status: 'inactive',
        message: 'No active subscription found'
      });
    }

    // Check if subscription is still active
    const isActive = data.status === 'active';
    const currentPeriodEnd = new Date(data.current_period_end);
    const isExpired = currentPeriodEnd < new Date();

    return res.json({
      hasSubscription: isActive && !isExpired,
      subscriptionTier: isActive && !isExpired ? data.subscription_tier : 'free',
      status: data.status,
      userId: data.user_id,
      email: data.email,
      currentPeriodEnd: data.current_period_end,
      stripeCustomerId: data.stripe_customer_id
    });

  } catch (error) {
    console.error('Error checking subscription:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ==========================================
// ENDPOINT 2: Stripe Webhook Handler
// ==========================================
app.post('/webhook/stripe', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('⚠️  Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('✅ Webhook received:', event.type);

    // Handle different event types
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function handleSubscriptionUpdate(subscription) {
  try {
    const customer = await stripe.customers.retrieve(subscription.customer);
    const priceId = subscription.items.data[0].price.id;
    const tier = TIER_MAPPING[priceId] || 'unknown';

    const subscriptionData = {
      user_id: customer.email, // Using email as user_id
      email: customer.email,
      stripe_customer_id: subscription.customer,
      subscription_tier: tier,
      status: subscription.status,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    };

    // Upsert to Supabase (insert or update)
    const { error } = await supabase
      .from('subscriptions')
      .upsert(subscriptionData, { 
        onConflict: 'user_id' 
      });

    if (error) {
      console.error('Supabase error:', error);
    } else {
      console.log('✅ Subscription updated in database:', customer.email, tier);
    }
  } catch (error) {
    console.error('Error handling subscription update:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  try {
    const customer = await stripe.customers.retrieve(subscription.customer);

    const { error } = await supabase
      .from('subscriptions')
      .update({ 
        status: 'canceled',
        subscription_tier: 'free',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_customer_id', subscription.customer);

    if (error) {
      console.error('Supabase error:', error);
    } else {
      console.log('✅ Subscription canceled in database:', customer.email);
    }
  } catch (error) {
    console.error('Error handling subscription deletion:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  console.log('💰 Payment succeeded for customer:', invoice.customer);
  // Subscription update is already handled by subscription.updated event
}

async function handlePaymentFailed(invoice) {
  try {
    const { error } = await supabase
      .from('subscriptions')
      .update({ 
        status: 'past_due',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_customer_id', invoice.customer);

    if (!error) {
      console.log('⚠️  Payment failed, subscription marked as past_due');
    }
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
  console.log(`🔗 Subscription check: http://localhost:${PORT}/api/check-subscription`);
  console.log(`🪝 Webhook endpoint: http://localhost:${PORT}/webhook/stripe`);
});