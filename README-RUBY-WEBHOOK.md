# Local Ruby Stripe webhook (development)

Steps to run locally and test with the Stripe CLI

1. Install Ruby (if you don't have it). On Windows, use RubyInstaller.
2. Install Bundler and dependencies:

```powershell
gem install bundler
bundle install
```
whsec_28c6321d51c8683cb4aacdef4ce98db6b8d8e6ab76081aa2a5efae8f003647ce
3. Start the Ruby webhook server:

```powershell
# In PowerShell (session):
$env:STRIPE_API_KEY = 'sk_test_...'
$env:STRIPE_WEBHOOK_SECRET = 'whsec_...'  # optional until you get the secret
ruby webhook.rb
```

4. In another terminal, run the Stripe CLI to forward events to your local endpoint and capture the signing secret:

```powershell
stripe listen --forward-to localhost:4567/webhook

# The CLI prints a "Webhook signing secret: whsec_..." value — copy it
# Then set it in your shell (PowerShell):
$env:STRIPE_WEBHOOK_SECRET = 'whsec_...'
```

5. Trigger a test event:

```powershell
stripe trigger payment_intent.succeeded
```

6. Watch the Ruby server output for the handled event. Implement order fulfillment or receipts where indicated in `webhook.rb`.

Notes
- For production, deploy to a secure HTTPS endpoint, set `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` in your environment, and restrict what events you accept.
- This example uses `Stripe::Webhook.construct_event` to verify signatures. Always verify signatures for production webhooks.
